#!/usr/bin/env python3
"""Convert an Arkamon's original action frames into lossless transparent atlases.

Requires Python3.10+, Pillow, NumPy and FFmpeg. All original frames/FPS are
preserved. Initial camera calibration is fixed per clip; the common scale,
ground plane and logical viewport come from idle. No synthetic frames are used.
Example:
  python scripts/build-arkamon-idle.py --source-dir animation-source/raw/5/front \
    --output public/sprites/arkamon/5/front --qa-dir ../qa \
    --reference public/sprites/front_sprites/5.png --ffmpeg /path/to/ffmpeg
  python scripts/build-arkamon-idle.py --species-id 20 \
    --reference public/sprites/front_sprites/20.png --ffmpeg /path/to/ffmpeg
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

SCREEN_DOMINANCE_CLEANUP = False
SCREEN_FRINGE_CLEANUP = False
WARM_DUST_DESPILL = False
SCREEN_COLOUR = 'green'
SCREEN_BACKGROUND_FALLBACK = None
PRESERVE_GREEN_BODY = False
PRESERVE_SATURATED_GREEN_BODY = False
SOFT_BLUE_SCREEN_REJECTION = False
WEBP_METHOD = 1


def save_lossless_webp(image: Image.Image, destination: Path, method: int = 1) -> None:
    """Compression effort changes encoded size/time, never native RGBA pixels."""
    if not 0 <= method <= 6:
        raise ValueError('WebP method must be in 0..6.')
    image.save(destination, format='WEBP', lossless=True, quality=100, method=method, exact=True)


def action_key_options(action: str) -> dict:
    """Keep pale hit dust, without treating a sustained victory aura as sparks."""
    return {'preserve_effects': action != 'idle',
            'neutral_tolerance': 30 if action == 'hit' else 10,
            'preserve_bloom': action != 'victory'}


def screen_fringe_mask(rgb: np.ndarray, preserve_effects: bool = False,
                       neutral_tolerance: float = 10, preserve_bloom: bool = True) -> tuple[np.ndarray, np.ndarray]:
    """Find baked yellow/green screen fringe, preserving bright warm effects.

    This profile is opt-in: intrinsic green character features would also match.
    Work on original RGB, before despill can turn green contamination yellow.
    """
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    maximum = rgb.max(axis=2)
    minimum = rgb.min(axis=2)
    delta = maximum - minimum
    safe_delta = np.maximum(delta, 1)
    hue = np.where(maximum == red, ((green-blue)/safe_delta) % 6,
                   np.where(maximum == green, (blue-red)/safe_delta+2,
                            (red-green)/safe_delta+4)) * 60
    saturation = delta / np.maximum(maximum, 1)
    warm_light = ((red >= 230) & (green <= red+6)) | ((red >= 190) & (red > green+15))
    fringe = ((hue >= 35) & (hue < 170) & (saturation > .20)
              & (green > blue+12) & (green > 24) & ~warm_light)
    if preserve_effects:
        # Hit/KO footage includes neutral smoke and cyan trails mixed with the
        # screen. These have more blue than yellow/olive outline contamination.
        fringe &= red > blue+neutral_tolerance
        # Preserve local golden bloom around native warm light cores, without
        # protecting the entire screen or an unlit character silhouette.
        seed = (red >= 190) & (green <= red+25) & (red > blue+50)
        if preserve_bloom and seed.any():
            # Binary square dilation via summed-area windows is equivalent to
            # MaxFilter(17), avoiding a 289-value scan per native source pixel.
            padded = np.pad(seed.astype(np.uint8), 8, mode='edge')
            integral = np.pad(padded, ((1,0),(1,0))).cumsum(axis=0,dtype=np.int32).cumsum(axis=1,dtype=np.int32)
            nearby = (integral[17:,17:]-integral[:-17,17:]
                      -integral[17:,:-17]+integral[:-17,:-17]) > 0
            warm_bloom = nearby & (hue < 65) & (red >= green-25)
            fringe &= ~warm_bloom
    return fringe, np.clip((45-hue)/10, 0, 1)


def ffmpeg_path(explicit: str | None) -> str:
    if explicit:
        return str(Path(explicit).resolve())
    candidate = shutil.which("ffmpeg")
    if candidate:
        return candidate
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, AttributeError) as exc:
        raise SystemExit("FFmpeg is required: use --ffmpeg PATH or install imageio-ffmpeg.") from exc


def conversion_actions(requested: list[str], reuse: bool) -> list[str]:
    actions = list(dict.fromkeys(requested))
    if 'idle' not in actions:
        if not reuse:
            raise ValueError('Include idle to establish the common reference scale and ground plane.')
        return actions
    actions.remove('idle')
    actions.insert(0, 'idle')
    return actions


def probe(ffmpeg: str, source: Path) -> dict:
    result = subprocess.run([ffmpeg, "-hide_banner", "-i", str(source)],
                            capture_output=True, text=True, check=False)
    text = result.stderr
    duration = re.search(r"Duration: (\d+):(\d+):([\d.]+)", text)
    video = next((line for line in text.splitlines() if "Video:" in line), "")
    dimensions = re.search(r"\b(\d{2,5})x(\d{2,5})\b", video)
    fps = re.search(r"([\d.]+) fps", video)
    if not (duration and dimensions and fps):
        raise SystemExit("Could not read source duration, dimensions, or nominal frame rate.")
    hours, minutes, seconds = map(float, duration.groups())
    version = subprocess.run([ffmpeg, "-version"], capture_output=True, text=True,
                             check=True).stdout.splitlines()[0]
    return {"width": int(dimensions[1]), "height": int(dimensions[2]),
            "fps": float(fps[1]), "durationSeconds": hours * 3600 + minutes * 60 + seconds,
            "ffmpegVersion": version}


def sample_screen_background(rgb: np.ndarray) -> np.ndarray:
    h, w = rgb.shape[:2]
    s = max(8, min(h, w) // 18)
    corners = np.concatenate([rgb[:s, :s].reshape(-1, 3), rgb[:s, -s:].reshape(-1, 3),
                              rgb[-s:, :s].reshape(-1, 3), rgb[-s:, -s:].reshape(-1, 3)])
    return np.median(corners, axis=0)


def key_alpha(image: Image.Image, cutoff: float = 0.08, preserve_effects: bool = False,
              neutral_tolerance: float = 10, preserve_bloom: bool = True) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Estimate soft coverage from green excess, then unmix and remove edge spill.

    The corner estimate is recalculated per source frame; the spatial transform
    is fixed later across all frames. Dark outlines, purple fur and red eyes
    have no positive green excess and retain full opacity.
    """
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    bg = sample_screen_background(rgb)
    channel = 2 if SCREEN_COLOUR == 'blue' else 1
    others = [index for index in range(3) if index != channel]
    bg_excess = float(bg[channel] - max(bg[index] for index in others))
    if bg_excess < 25 and SCREEN_BACKGROUND_FALLBACK is not None:
        # A native full-screen flash can cover the corners. Use the explicitly
        # audited screen from this clip, rather than treating the flash as key.
        bg = np.asarray(SCREEN_BACKGROUND_FALLBACK, dtype=np.float32)
        bg_excess = float(bg[channel] - max(bg[index] for index in others))
    if bg_excess < 25:
        raise ValueError(f"Source corners are not sufficiently {SCREEN_COLOUR} for this converter.")
    excess = rgb[:, :, channel] - np.maximum(rgb[:, :, others[0]], rgb[:, :, others[1]])
    alpha = np.clip(1.0 - np.maximum(excess, 0.0) / bg_excess, 0.0, 1.0)
    # Darker screen patches and source shadows retain the screen chromaticity.
    # Match colour ratios, rather than brightness, to prevent a tinted floor line.
    denominator = np.maximum(rgb[:, :, channel], 1.0)
    screen_deviation = np.maximum(np.abs(rgb[:, :, others[0]] / denominator - bg[others[0]] / bg[channel]),
                                  np.abs(rgb[:, :, others[1]] / denominator - bg[others[1]] / bg[channel]))
    screen_colour = ((screen_deviation < .12)
                     & (excess > 12))
    if SCREEN_COLOUR == 'blue' and SOFT_BLUE_SCREEN_REJECTION:
        # Native weak green aura over blue needs a gradual matte at the screen
        # colour boundary. Hard ratio rejection otherwise creates a cut edge.
        weight = np.clip((screen_deviation - .02) / .10, 0, 1)
        alpha *= np.where(excess > 12, weight, 1)
    else:
        alpha[screen_colour] = 0.0
    if PRESERVE_GREEN_BODY:
        # Audited green-grey scales are far from the saturated screen chroma.
        # Restore opaque body colour only in this explicit species profile;
        # screen pockets stay transparent, while mixed edges/fades keep keying.
        foreground_max = np.maximum(rgb[:, :, 0], rgb[:, :, 2])
        body_weight = np.clip((.35 - np.maximum(excess, 0) / bg_excess) / .10, 0, 1)
        body_weight *= (~screen_colour) & (foreground_max >= 24)
        alpha += body_weight * (1 - alpha)
    if PRESERVE_SATURATED_GREEN_BODY:
        # Some audited iridescent bodies contain native green gradients. Only
        # restore their interior: a two-pixel erosion of the existing matte
        # excludes green edge contamination and every transparent screen hole.
        # Low-coverage native fades keep their original soft alpha. Nothing is
        # painted into screen-coloured cutouts between ribbon-shaped wings.
        interior = np.asarray(Image.fromarray(np.uint8(alpha > .4) * 255)
                              .filter(ImageFilter.MinFilter(5))) > 0
        body_weight = np.clip((screen_deviation - .12) / .10, 0, 1)
        body_weight *= (interior & (excess > 8) & (rgb[:, :, 1] >= 100)
                        & (np.maximum(rgb[:, :, 0], rgb[:, :, 2]) >= 40))
        alpha += body_weight * (1 - alpha)
    if SCREEN_DOMINANCE_CLEANUP:
        # Some source screens include a nonuniform green haze. Remove its
        # dominant screen chroma as well as the corner colour. This optional
        # mode is intended for characters without intrinsic green features.
        foreground_max = np.maximum(rgb[:, :, 0], rgb[:, :, 2])
        haze = (rgb[:, :, 1] > foreground_max * 1.18) & (excess > 12)
        alpha[haze] = 0.0
    if SCREEN_FRINGE_CLEANUP:
        fringe, coverage = screen_fringe_mask(rgb, preserve_effects, neutral_tolerance, preserve_bloom)
        # Global within this opt-in character profile: a connected-background
        # mask misses contaminated holes enclosed by limbs or flame outlines.
        alpha[fringe] *= coverage[fringe]
    alpha[alpha < cutoff] = 0.0
    return rgb, alpha, bg


def remove_green(image: Image.Image, cutoff: float = 0.08, preserve_effects: bool = False,
                 neutral_tolerance: float = 10, preserve_bloom: bool = True) -> tuple[Image.Image, list]:
    rgb, alpha, bg = key_alpha(image, cutoff, preserve_effects, neutral_tolerance, preserve_bloom)
    safe_alpha = np.maximum(alpha, 1.0 / 255.0)
    recovered = np.clip((rgb - (1.0 - alpha[:, :, None]) * bg) / safe_alpha[:, :, None], 0, 255)
    edge = alpha < 0.999
    channel = 2 if SCREEN_COLOUR == 'blue' else 1
    others = [index for index in range(3) if index != channel]
    neutral_screen = np.maximum(recovered[:, :, others[0]], recovered[:, :, others[1]])
    recovered[:, :, channel] = np.where(edge, np.minimum(recovered[:, :, channel], neutral_screen),
                                       recovered[:, :, channel])
    if WARM_DUST_DESPILL:
        # A sand plume may already contain olive contamination before keying.
        # Correct its colour without deleting opacity or motion. Preserve native
        # bright gold, neutral smoke and cyan; this is an opt-in sand-only profile.
        warm_dust = ((rgb[:, :, 1] >= .90 * rgb[:, :, 0])
                     & (rgb[:, :, 0] > rgb[:, :, 2] + 20)
                     & ~((rgb[:, :, 0] >= 230) & (rgb[:, :, 1] <= rgb[:, :, 0] + 6))
                     & (alpha > 0))
        recovered[:, :, 1] = np.where(warm_dust,
                                     np.minimum(recovered[:, :, 1], .85 * recovered[:, :, 0]),
                                     recovered[:, :, 1])
    recovered[alpha == 0] = 0
    rgba = np.concatenate([np.rint(recovered).astype(np.uint8),
                           np.rint(alpha[:, :, None] * 255).astype(np.uint8)], axis=2)
    return Image.fromarray(rgba), bg.astype(int).tolist()


def bounds(image: Image.Image) -> tuple[int, int, int, int]:
    box = image.getchannel("A").getbbox()
    if box is None:
        raise ValueError("A source frame became completely transparent.")
    return box


def frame_difference(a: Image.Image, b: Image.Image) -> dict:
    aa = np.asarray(a, dtype=np.float32) / 255
    bb = np.asarray(b, dtype=np.float32) / 255
    body = np.maximum(aa[:, :, 3], bb[:, :, 3]) > 0.1
    if not body.any():
        return {"bodyPremultipliedRgbMeanAbsoluteDifference": 0.0,
                "bodyAlphaMeanAbsoluteDifference": 0.0,
                "bodyChangedPixelFractionOver5Percent": 0.0}
    a_rgb = aa[:, :, :3] * aa[:, :, 3:4]
    b_rgb = bb[:, :, :3] * bb[:, :, 3:4]
    mae = np.abs(a_rgb - b_rgb).mean(axis=2)
    alpha_mae = np.abs(aa[:, :, 3] - bb[:, :, 3])
    return {"bodyPremultipliedRgbMeanAbsoluteDifference": round(float(mae[body].mean()), 6),
            "bodyAlphaMeanAbsoluteDifference": round(float(alpha_mae[body].mean()), 6),
            "bodyChangedPixelFractionOver5Percent": round(float((mae[body] > .05).mean()), 6)}


def save_contacts(frames: list[Image.Image], qa: Path, battle: Path | None, fps: int) -> None:
    indices = np.linspace(0, len(frames) - 1, min(12, len(frames)), dtype=int).tolist()
    cell = frames[0].width
    contact_columns = min(4, len(indices))
    contact_rows = math.ceil(len(indices) / contact_columns)
    for name, color in [("dark", (16, 23, 34)), ("light", (239, 243, 248)), ("battle", (55, 83, 58))]:
        sheet = Image.new("RGB", (cell * contact_columns, (cell + 28) * contact_rows), color)
        draw = ImageDraw.Draw(sheet)
        background = None
        if name == "battle" and battle:
            background = ImageOps.fit(Image.open(battle).convert("RGB"), (cell, cell))
        for slot, index in enumerate(indices):
            x, y = slot % contact_columns * cell, slot // contact_columns * (cell + 28)
            tile = (background.copy() if background else Image.new("RGB", (cell, cell), color))
            tile.paste(frames[index], (0, 0), frames[index])
            sheet.paste(tile, (x, y))
            draw.text((x + 12, y + cell + 6), f"Frame {index + 1:02d} / t={index / fps:.3f}s", fill=(255, 255, 255) if name != "light" else (20, 30, 42))
        sheet.save(qa / f"contact-{name}.jpg", quality=96, subsampling=0)
    seam = Image.new("RGB", (cell * 2, cell + 28), (239, 243, 248))
    draw = ImageDraw.Draw(seam)
    for slot, index in enumerate([0, len(frames) - 1]):
        seam.paste(frames[index], (slot * cell, 0), frames[index])
        draw.text((slot * cell + 12, cell + 6), f"{'First' if slot == 0 else 'Last'} sampled frame {index + 1}", fill=(20, 30, 42))
    seam.save(qa / "loop-seam.jpg", quality=96, subsampling=0)


def alpha_bounds(alpha: np.ndarray) -> tuple[int, int, int, int] | None:
    return Image.fromarray(np.rint(alpha * 255).astype(np.uint8)).getbbox()


def union_bounds(boxes: list) -> tuple[int, int, int, int]:
    present = [b for b in boxes if b is not None]
    if not present:
        raise ValueError('A clip contains no visible keyed pixels.')
    return (min(b[0] for b in present), min(b[1] for b in present),
            max(b[2] for b in present), max(b[3] for b in present))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect_clip(ffmpeg: str, source: Path, action: str, decoded: Path,
                 temporary: Path, cutoff: float) -> dict:
    info = probe(ffmpeg, source)
    source_hash = sha256(source)
    cache_report = decoded.parent / 'source-audit.json'
    cache = json.loads(cache_report.read_text(encoding='utf-8')) if cache_report.exists() else {}
    paths = sorted((decoded / action).glob('frame-*.png'))
    if not (paths and cache.get(action, {}).get('sha256') == source_hash
            and len(paths) == cache[action]['decodedFrameCount']):
        folder = temporary / action
        folder.mkdir(parents=True, exist_ok=True)
        subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                        '-map', '0:v:0', '-an', '-sn', '-fps_mode', 'passthrough',
                        '-start_number', '0', str(folder / 'frame-%04d.png')], check=True)
        paths = sorted(folder.glob('frame-*.png'))
    if not paths:
        raise ValueError(f'No original frames decoded for {action}.')
    boxes = []
    fallback_frames = []
    first_core = None
    for i, path in enumerate(paths):
        with Image.open(path) as image:
            if image.size != (info['width'], info['height']):
                raise ValueError('Decoded source frame dimensions do not match the video.')
            rgb, alpha, background = key_alpha(image, cutoff, **action_key_options(action))
            if SCREEN_BACKGROUND_FALLBACK is not None:
                native_background = sample_screen_background(rgb)
                screen_channel = 2 if SCREEN_COLOUR == 'blue' else 1
                native_excess = native_background[screen_channel] - max(native_background[index] for index in range(3) if index != screen_channel)
                if native_excess < 25:
                    fallback_frames.append(i)
        boxes.append(alpha_bounds(alpha))
        if i == 0:
            # Ignore bright glints/rings when calibrating the initial body pose.
            core = (alpha > .9) & (rgb.max(axis=2) < 210)
            first_core = Image.fromarray(core.astype(np.uint8)*255).getbbox()
    if first_core is None:
        raise ValueError(f'The first {action} frame has no calibratable character body.')
    info.update({'sha256': source_hash, 'sizeBytes': source.stat().st_size,
                 'decodedFrameCount': len(paths), 'durationFromFramesSeconds':len(paths)/info['fps']})
    result = {'action': action, 'source': source, 'info': info, 'paths': paths,
              'boxes': boxes, 'union': union_bounds(boxes), 'firstCore': first_core,
              'screenBackgroundFallbackFrames': fallback_frames}
    print(json.dumps({'inspectedAction':action, 'frames':len(paths), 'fps':info['fps'],
                      'firstCoreBodyBounds':first_core,'unionAlphaBounds':result['union']}),flush=True)
    return result


def common_plan(clips: list[dict], reference: Path | None, base_cell: int,
                ground: float, occupancy: float, padding: int, max_texture: int,
                fit_initial_body: bool = False) -> dict:
    idle = next(c for c in clips if c['action'] == 'idle')
    first = idle['firstCore']
    anchor = ((first[0]+first[2])/2, first[3])
    body_height = first[3]-first[1]
    reference_meta = None
    if reference:
        image = Image.open(reference).convert('RGBA')
        box = bounds(image)
        # The static PNG is contained and centered inside a square battle slot.
        # A wide reference has transparent letterboxing above and below its image.
        reference_edge = max(image.size)
        reference_top = (reference_edge-image.height)/2
        occupancy = (box[3]-box[1])/reference_edge
        ground = (reference_top+box[3])/reference_edge
        reference_meta = {'size':list(image.size),'alphaBounds':list(box),
                          'bodyHeightFraction':occupancy,'groundFraction':ground}
    # Flying rocks and sparks may span the screen during an idle. Fitting that
    # union makes the character tiny; the opt-in fits its initial opaque body
    # while the common padded canvas still includes every frame's full artwork.
    idle_crop = first if fit_initial_body else idle['union']
    scale = min(base_cell*occupancy/(idle_crop[3]-idle_crop[1]),
                (base_cell-2)/(idle_crop[2]-idle_crop[0]))
    origin = (base_cell/2-anchor[0]*scale, round(base_cell*ground)-anchor[1]*scale)
    virtual_boxes = []
    for clip in clips:
        box = clip['firstCore']
        camera_scale = body_height/(box[3]-box[1])
        camera_origin = (anchor[0]-camera_scale*(box[0]+box[2])/2,
                         anchor[1]-camera_scale*box[3])
        clip['camera'] = {'nativeToIdleCoordinateScale':camera_scale,
                          'nativeToIdleCoordinateOffset':list(camera_origin),
                          'initialBodyCoreBounds':list(box),
                          'initialBodyHeightInIdleCoordinates':body_height,
                          'initialGroundInIdleCoordinates':anchor[1],
                          'constantForEntireClip':True}
        for box in clip['boxes']:
            if box is not None:
                virtual_boxes.append((box[0]*camera_scale+camera_origin[0],
                                      box[1]*camera_scale+camera_origin[1],
                                      box[2]*camera_scale+camera_origin[0],
                                      box[3]*camera_scale+camera_origin[1]))
    common = union_bounds(virtual_boxes)
    output_box = (math.floor(common[0]*scale+origin[0]), math.floor(common[1]*scale+origin[1]),
                  math.ceil(common[2]*scale+origin[0]), math.ceil(common[3]*scale+origin[1]))
    left = max(0,padding-output_box[0])
    top = max(0,padding-output_box[1])
    right = max(0,output_box[2]+padding-base_cell)
    bottom = max(0,output_box[3]+padding-base_cell)
    padded_width, padded_height = base_cell+left+right, base_cell+top+bottom
    cell = math.ceil(max(padded_width,padded_height)/64)*64
    left += (cell-padded_width)//2
    top += (cell-padded_height)//2
    max_cells = max_texture//cell
    if any(len(c['paths']) > max_cells*max_cells for c in clips):
        raise ValueError('The padded frame grid exceeds the maximum texture size; increase --max-texture explicitly.')
    viewport = {'width':base_cell,'height':base_cell,'left':left,'top':top}
    result = {'schemaVersion':1,'referenceAction':'idle','referenceFrameIndex':0,
              'reference':reference_meta,'idleBodyCoreBounds':list(first),
              'idleBodyHeightSourcePixels':body_height,'idleBodyHeightOutputPixels':body_height*scale,
              'idleGroundSourcePixels':anchor[1],'sourceCoordinateSystem':list((idle['info']['width'],idle['info']['height'])),
              'sharedScale':scale,'logicalCanvasOrigin':list(origin),
              'canonicalUnionAlphaBounds':list(common),'logicalUnionAlphaBounds':list(output_box),
              'cellWidth':cell,'cellHeight':cell,'viewport':viewport,
              'groundPivot':[base_cell/2+left,round(base_cell*ground)+top],
              'paddingPixels':padding,'maxTextureDimension':max_texture,
              'notes':'Each clip uses a fixed initial-body camera calibration, then the same idle-derived pixel scale and ground plane. Canvas padding is outside the common logical viewport.'}
    if fit_initial_body:
        result['scaleReference'] = 'Initial opaque body; all native motion and effects retained in canvas padding.'
    return result


def reuse_normalization(clips: list[dict], previous: Path, species_id: int) -> dict:
    """Re-key existing assets without changing their established screen geometry."""
    common = json.loads((previous/'animation-set.normalization.json').read_text(encoding='utf-8'))
    for clip in clips:
        old = json.loads((previous/f"{clip['action']}.metadata.json").read_text(encoding='utf-8'))
        if (old['speciesId'] != species_id or old['action'] != clip['action']
                or old['source']['sha256'] != clip['info']['sha256']
                or old['source']['width'] != clip['info']['width']
                or old['source']['height'] != clip['info']['height']
                or old['sheet']['frameCount'] != len(clip['paths'])
                or old['sheet']['fps'] != clip['info']['fps']
                or old['transform']['sharedTransform'] != common):
            raise ValueError(f"Cannot reuse {clip['action']} geometry: source or metadata differs.")
        crop = tuple(old['transform']['sourceUnionAlphaBounds'])
        actual = clip['union']
        if actual[0] < crop[0] or actual[1] < crop[1] or actual[2] > crop[2] or actual[3] > crop[3]:
            raise ValueError(f"Re-keyed {clip['action']} would exceed the previous source crop.")
        clip['union'] = crop
        clip['camera'] = old['transform']['cameraCalibration']
        clip['previousMetadata'] = old
    return common


def normalize_frame(image: Image.Image, clip: dict, common: dict, cutoff: float) -> Image.Image:
    keyed,_ = remove_green(image,cutoff,**action_key_options(clip['action']))
    crop = clip['union']
    camera = clip['camera']
    scale = common['sharedScale']*camera['nativeToIdleCoordinateScale']
    size = (max(1,round((crop[2]-crop[0])*scale)),max(1,round((crop[3]-crop[1])*scale)))
    offset = camera['nativeToIdleCoordinateOffset']
    origin = common['logicalCanvasOrigin']
    viewport = common['viewport']
    position = (round((crop[0]*camera['nativeToIdleCoordinateScale']+offset[0])*common['sharedScale']+origin[0])+viewport['left'],
                round((crop[1]*camera['nativeToIdleCoordinateScale']+offset[1])*common['sharedScale']+origin[1])+viewport['top'])
    if min(position) < 0 or position[0]+size[0] > common['cellWidth'] or position[1]+size[1] > common['cellHeight']:
        raise ValueError(f"The fixed {clip['action']} transform would clip the source animation.")
    resized = keyed.crop(crop).resize(size,Image.Resampling.LANCZOS)
    pixels = np.asarray(resized).copy()
    edge = pixels[:,:,3] < 255
    channel = 2 if SCREEN_COLOUR == 'blue' else 1
    others = [index for index in range(3) if index != channel]
    pixels[:,:,channel] = np.where(edge,np.minimum(pixels[:,:,channel],np.maximum(pixels[:,:,others[0]],pixels[:,:,others[1]])),pixels[:,:,channel])
    # Lossless output can still contain a few chroma pixels from resampling an
    # opaque source edge. Remove only dominant green spill left over there.
    channel_max = np.maximum(pixels[:,:,others[0]],pixels[:,:,others[1]]).astype(np.int16)
    spill = pixels[:,:,channel].astype(np.int16) > channel_max + 8
    if PRESERVE_GREEN_BODY or PRESERVE_SATURATED_GREEN_BODY:
        spill &= edge
    pixels[:,:,channel] = np.where(spill,channel_max,pixels[:,:,channel])
    pixels[pixels[:,:,3] == 0,:3] = 0
    tile = Image.new('RGBA',(common['cellWidth'],common['cellHeight']),(0,0,0,0))
    tile.paste(Image.fromarray(pixels),position)
    return tile


def save_video_preview(frames: list[Image.Image], qa: Path, fps: float,
                       battle: Path | None, ffmpeg: str) -> Path:
    cell = frames[0].width
    background = (ImageOps.fit(Image.open(battle).convert('RGB'),(cell,cell))
                  if battle else Image.new('RGB',(cell,cell),(25,35,49)))
    target = qa/'preview-battle.mp4'
    process = subprocess.Popen([ffmpeg,'-hide_banner','-loglevel','error','-y','-f','rawvideo',
                                '-pixel_format','rgb24','-video_size',f'{cell}x{cell}',
                                '-framerate',str(fps),'-i','pipe:0','-an','-c:v','libx264',
                                '-preset','veryfast','-crf','18','-pix_fmt','yuv420p',
                                '-movflags','+faststart',str(target)],stdin=subprocess.PIPE,
                               stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for frame in frames:
            rendered = background.copy()
            rendered.paste(frame,(0,0),frame)
            process.stdin.write(rendered.tobytes())
        process.stdin.close()
        error = process.stderr.read().decode('utf-8',errors='replace')
        if process.wait() != 0:
            raise RuntimeError(f'Could not encode QA preview: {error}')
    finally:
        if process.poll() is None:
            process.kill()
    return target


def convert_clip(clip: dict, common: dict, output: Path, qa: Path | None,
                 ffmpeg: str, battle: Path | None, cutoff: float, columns: int,
                 idle_first: Image.Image | None, species_id: int = 5) -> tuple[dict,Image.Image]:
    action,info = clip['action'],clip['info']
    count,fps = len(clip['paths']),info['fps']
    max_cells = common['maxTextureDimension']//common['cellWidth']
    preferred = columns if columns else clip.get('previousMetadata', {}).get('sheet', {}).get('columns', math.ceil(math.sqrt(count)))
    columns = max(math.ceil(count/max_cells),min(preferred,max_cells))
    rows = math.ceil(count/columns)
    frames = []
    for path in clip['paths']:
        with Image.open(path) as image:
            frames.append(normalize_frame(image,clip,common,cutoff))
    cell = common['cellWidth']
    atlas = Image.new('RGBA',(cell*columns,cell*rows),(0,0,0,0))
    for index,frame in enumerate(frames):
        atlas.paste(frame,(index%columns*cell,index//columns*cell))
    atlas_path,poster_path = output/f'{action}.webp',output/f'{action}-poster.webp'
    # Method controls compression effort only; every RGBA pixel remains lossless.
    save_lossless_webp(atlas,atlas_path,WEBP_METHOD)
    save_lossless_webp(frames[0],poster_path,WEBP_METHOD)
    with Image.open(atlas_path) as loaded:
        if loaded.size != atlas.size or getattr(loaded,'n_frames',1) != 1:
            raise RuntimeError('The atlas must be a static image with the declared dimensions.')
        if not np.array_equal(np.asarray(loaded.convert('RGBA')),np.asarray(atlas)):
            raise RuntimeError('The lossless atlas failed its decoded RGBA equality check.')
    adjacent = [frame_difference(frames[i],frames[i+1]) for i in range(count-1)]
    seam = frame_difference(frames[-1],frames[0])
    differences = [x['bodyPremultipliedRgbMeanAbsoluteDifference'] for x in adjacent]
    median = float(np.median(differences)) if differences else 0
    seam.update({'adjacentMedianBodyRgbDifference':round(median,6),
                 'adjacentMaxBodyRgbDifference':max(differences,default=0),
                 'seamToAdjacentMedianRatio':round(seam['bodyPremultipliedRgbMeanAbsoluteDifference']/max(median,1e-9),3)})
    green_count,blue_count,occupied,red_count,yellow_green_count = 0,0,0,0,0
    frame_boxes,blank_frames = [],[]
    for index,frame in enumerate(frames):
        pixels = np.asarray(frame).astype(np.int16)
        visible = pixels[:,:,3] > 16
        green_count += int(((pixels[:,:,1] > np.maximum(pixels[:,:,0],pixels[:,:,2])+8)&visible).sum())
        blue_count += int(((pixels[:,:,2] > np.maximum(pixels[:,:,0],pixels[:,:,1])+8)&visible).sum())
        occupied += int(visible.sum())
        red_count += int(((pixels[:,:,0]>pixels[:,:,1]+35)&(pixels[:,:,0]>pixels[:,:,2]+20)&visible).sum())
        # Independent diagnostic on saved output colours, including olive/yellow
        # that the green-dominance check cannot see. Legitimate gold can match.
        yellow_green_count += int(((pixels[:,:,1] >= .93*pixels[:,:,0])
                                   & (pixels[:,:,1] > 32) & (pixels[:,:,2] < .78*pixels[:,:,1])
                                   & (pixels[:,:,0] > pixels[:,:,2]+10) & visible).sum())
        frame_boxes.append(frame.getchannel('A').getbbox())
        if not visible.any():
            blank_frames.append(index)
    metadata = {'schemaVersion':1,'speciesId':species_id,'view':'front','action':action,
                'source':{'file':f'animation-source/raw/{species_id}/front/{action}.mp4',**info},
                'sampling':{'method':'Every decoded source frame, in original order, at original FPS; no skipping, interpolation, generation, reversal or crossfade.',
                            'allSourceFramesPreserved':True,'sourceFrameIndices':list(range(count)),
                            'sampleTimesSeconds':[round(i/fps,6) for i in range(count)],
                            'firstSampleSeconds':0,'lastSampleSeconds':(count-1)/fps},
                'sheet':{'file':atlas_path.name,'format':'static lossless WebP RGBA','animated':False,'compressionMethod':WEBP_METHOD,
                         'cellWidth':cell,'cellHeight':cell,'columns':columns,'rows':rows,
                         'frameCount':count,'fps':fps,'durationSeconds':count/fps,'durationMs':round(1000*count/fps),
                         'width':atlas.width,'height':atlas.height,'sizeBytes':atlas_path.stat().st_size,
                         'sha256':sha256(atlas_path),'viewport':common['viewport']},
                'poster':{'file':poster_path.name,'frameIndex':0,'sizeBytes':poster_path.stat().st_size,'sha256':sha256(poster_path)},
                'viewport':common['viewport'],
                'transform':{'fixedTransformAcrossFrames':True,'sharedTransform':common,
                             'cameraCalibration':clip['camera'],'sourceUnionAlphaBounds':list(clip['union']),
                             'sourceFrameAlphaBounds':[list(b) if b else None for b in clip['boxes']],
                             'outputFrameAlphaBounds':[list(b) if b else None for b in frame_boxes],
                             'scale':common['sharedScale'],'groundPivot':common['groundPivot']},
                'key':{'method':'Corner-sampled soft green-excess alpha plus brightness-independent screen-colour ratio rejection; edge despill before and after resampling.',
                       'alphaCutoff':cutoff,'screenColourRatioTolerance':.12,
                       'screenDominanceCleanup':SCREEN_DOMINANCE_CLEANUP,
                       'screenDominanceRatio':1.18 if SCREEN_DOMINANCE_CLEANUP else None,
                       'screenFringeCleanup':SCREEN_FRINGE_CLEANUP,
                       'screenFringeProfile':({'hueFadeDegrees':[35,45], 'hueEndDegrees':170,
                                              'minimumSaturation':.20, 'minimumGreenMinusBlue':12,
                                              'warmLightProtection':'R >= 230 and G <= R+6, or R >= 190 and R > G+15',
                                              'preserveNeutralAndCyanEffects':action != 'idle',
                                              'neutralRedBlueTolerance':30 if action == 'hit' else 10,
                                              'warmBloomRadiusSourcePixels':8 if action not in ('idle','victory') else 0,
                                              'warmBloomProtection':('Seeds R >= 190, G <= R+25, R > B+50; nearby hue < 65 and R >= G-25.' if action not in ('idle','victory') else None),
                                              'scope':'Original RGB, including enclosed screen pockets; opt-in for characters without green features.'}
                                             if SCREEN_FRINGE_CLEANUP else None)},
                'qa':{'losslessDecodedRgbaMatches':True,'remainingGreenDominantPixelsOver8':green_count,
                      'yellowGreenDiagnosticPixelsAllFrames':yellow_green_count,
                      'yellowGreenDiagnosticNote':'Includes genuine gold light; review source effects and silhouette on light/dark backgrounds. Green-dominance count alone does not prove clean edges.',
                      'occupiedPixelsAllFrames':occupied,'redDominantPixelsAllFrames':red_count,
                      'transparentFrameIndices':blank_frames,'loopSeam':seam,
                      'loopSeamPerfect':seam['bodyPremultipliedRgbMeanAbsoluteDifference']==0,
                      'originalFinalFramePreserved':True,
                      'sourceFramesTouchingEdges':[i for i,b in enumerate(clip['boxes']) if b and (b[0]==0 or b[1]==0 or b[2]==info['width'] or b[3]==info['height'])],
                      'notes':'Original source motion, effects, pauses and final frame are retained. Only idle loops; action clips play once.'}}
    if WARM_DUST_DESPILL:
        metadata['key']['warmDustDespill'] = {
            'originalMask':'G >= .90 R; R > B+20; preserve R >= 230 with G <= R+6.',
            'greenCeilingFractionOfRecoveredRed':.85,
            'alphaUnchanged':True,
        }
    if SCREEN_COLOUR == 'blue':
        metadata['key']['screenColour'] = 'blue'
        metadata['key']['method'] = 'Corner-sampled soft blue-excess alpha plus brightness-independent screen-colour ratio rejection; blue edge despill before and after resampling. Native green features retained.'
        metadata['qa']['remainingBlueDominantPixelsOver8'] = blue_count
        metadata['qa']['nativeGreenPixelsAllowed'] = True
        if SOFT_BLUE_SCREEN_REJECTION:
            metadata['key']['softBlueScreenRejection'] = {'screenRatioDeviationStart':.02,'screenRatioDeviationEnd':.12,'nativeGreenUnchanged':True}
    if PRESERVE_SATURATED_GREEN_BODY:
        metadata['key']['preserveSaturatedGreenBody'] = {
            'minimumBaseAlpha': .4,
            'interiorErosionPixels': 2,
            'screenRatioDeviationFade': [.12, .22],
            'minimumOtherChannel': 40,
            'minimumGreen': 100,
            'sourceRgbRetainedInOpaqueInteriors': True,
            'screenPocketsAndLowCoverageFadesUnchanged': True,
        }
        metadata['qa']['nativeGreenPixelsAllowed'] = True
    if SCREEN_BACKGROUND_FALLBACK is not None:
        metadata['key']['screenBackgroundFallback'] = list(SCREEN_BACKGROUND_FALLBACK)
        metadata['key']['screenBackgroundFallbackFrames'] = clip.get('screenBackgroundFallbackFrames', [])
    if PRESERVE_GREEN_BODY:
        metadata['key']['preserveGreenBody'] = {
            'opaqueBelowScreenExcessFraction': .25,
            'fadeToBaseKeyByScreenExcessFraction': .35,
            'screenPocketsExcluded': True,
            'minimumOtherChannel': 24,
        }
        metadata['qa']['nativeGreenPixelsAllowed'] = True
    screen_count = blue_count if SCREEN_COLOUR == 'blue' else green_count
    if screen_count and not (PRESERVE_GREEN_BODY or PRESERVE_SATURATED_GREEN_BODY):
        raise RuntimeError(f'{action} retains {screen_count} {SCREEN_COLOUR}-dominant pixels.')
    if 'timing' in clip.get('previousMetadata', {}):
        metadata['timing'] = clip['previousMetadata']['timing']
    if 'calibrationInspection' in clip.get('previousMetadata', {}):
        metadata['calibrationInspection'] = clip['previousMetadata']['calibrationInspection']
    if idle_first is not None:
        metadata['qa']['returnToIdleFirst'] = frame_difference(frames[-1],idle_first)
    if qa:
        folder = qa/action
        folder.mkdir(parents=True,exist_ok=True)
        save_contacts(frames,folder,battle,fps)
        preview = save_video_preview(frames,folder,fps,battle,ffmpeg)
        metadata['qa']['preview'] = {'file':str(preview.relative_to(qa)),'sizeBytes':preview.stat().st_size,'sha256':sha256(preview)}
        frames[-1].save(folder/'last-frame.png')
    (output/f'{action}.metadata.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'completedAction':action,'sheet':metadata['sheet'],'greenPixels':green_count,
                      'transparentFrameIndices':blank_frames,'loopSeam':seam}),flush=True)
    return metadata,frames[0]


def main() -> None:
    global SCREEN_DOMINANCE_CLEANUP, SCREEN_FRINGE_CLEANUP, WARM_DUST_DESPILL, SCREEN_COLOUR, SCREEN_BACKGROUND_FALLBACK, PRESERVE_GREEN_BODY, PRESERVE_SATURATED_GREEN_BODY, SOFT_BLUE_SCREEN_REJECTION, WEBP_METHOD
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--species-id',type=int,default=5)
    parser.add_argument('--source-dir',type=Path)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--actions',nargs='+',choices=['idle','attack','hit','victory','ko'],default=['idle','attack','hit','victory','ko'])
    parser.add_argument('--qa-dir',type=Path)
    parser.add_argument('--decoded-dir',type=Path)
    parser.add_argument('--reference',type=Path)
    parser.add_argument('--battle-background',type=Path)
    parser.add_argument('--ffmpeg')
    parser.add_argument('--webp-method',type=int,choices=range(7),default=1,
                        help='Lossless WebP compression effort 0..6; 1 reduces import time. Use 4 for the historical compression effort; RGBA pixels are identical.')
    parser.add_argument('--base-cell',type=int,default=384)
    parser.add_argument('--columns',type=int,default=0)
    parser.add_argument('--max-texture',type=int,default=8192)
    parser.add_argument('--padding',type=int,default=16)
    parser.add_argument('--occupancy',type=float,default=1874/2048)
    parser.add_argument('--ground',type=float,default=1956/2048)
    parser.add_argument('--alpha-cutoff',type=float,default=.08)
    parser.add_argument('--screen-colour',choices=['green','blue'],default='green',
                        help='Chroma screen channel; blue retains native green foliage. Default preserves existing green conversions.')
    parser.add_argument('--screen-background-fallback',nargs=3,type=int,metavar=('R','G','B'),
                        help='Audited RGB screen for frames whose native flash covers the corners; used only when corner chroma is unavailable.')
    parser.add_argument('--preserve-green-body',action='store_true',
                        help='Keep audited green-grey body colours distinct from saturated green screen; screen pockets and mixed edges remain keyed.')
    parser.add_argument('--preserve-saturated-green-body',action='store_true',
                        help='Retain audited native green gradients inside the existing body matte; keep screen pockets, outer edges and low-coverage fades keyed.')
    parser.add_argument('--saturated-green-body-actions',nargs='+',choices=['idle','attack','hit','victory','ko'],default=['idle','attack','hit','victory','ko'],
                        help='Apply the audited native green interior profile only to these actions; use idle when native action effects need the unmodified base key.')
    parser.add_argument('--soft-blue-screen-rejection',action='store_true',
                        help='Fade the blue screen colour-ratio matte to retain an audited weak green aura; only for blue screen clips.')
    parser.add_argument('--screen-dominance-cleanup',action='store_true',
                        help='Remove nonuniform green screen haze; use only when the character has no intrinsic green features.')
    parser.add_argument('--screen-fringe-cleanup',action='store_true',
                        help='Remove baked yellow/green fringe and enclosed screen pockets while protecting warm light; opt-in only for characters without green features.')
    parser.add_argument('--base-key-actions',nargs='+',choices=['idle','attack','hit','victory','ko'],default=[],
                        help='Use the base key for these actions to preserve native dust, bloom and fading smoke, even when additional cleanup is enabled for the set.')
    parser.add_argument('--fit-initial-body',action='store_true',
                        help='Fit the first idle body rather than distant idle particles; retain full motion and effects in the padded canvas.')
    parser.add_argument('--warm-dust-despill',action='store_true',
                        help='Correct olive screen contamination in warm sand RGB without changing alpha; opt-in only for characters without intrinsic olive/green details.')
    parser.add_argument('--reuse-normalization',type=Path,
                        help='Reuse source-verified geometry, crops, camera calibration and timing markers from an existing asset directory.')
    parser.add_argument('--analyze-only',action='store_true')
    args = parser.parse_args()
    WEBP_METHOD = args.webp_method
    SCREEN_COLOUR = args.screen_colour
    SCREEN_BACKGROUND_FALLBACK = args.screen_background_fallback
    PRESERVE_GREEN_BODY = args.preserve_green_body
    PRESERVE_SATURATED_GREEN_BODY = args.preserve_saturated_green_body
    SOFT_BLUE_SCREEN_REJECTION = args.soft_blue_screen_rejection
    if SOFT_BLUE_SCREEN_REJECTION and SCREEN_COLOUR != 'blue':
        parser.error('Soft blue screen rejection requires --screen-colour blue.')
    if (PRESERVE_GREEN_BODY or PRESERVE_SATURATED_GREEN_BODY) and (SCREEN_COLOUR != 'green' or args.screen_dominance_cleanup or args.screen_fringe_cleanup or args.warm_dust_despill):
        parser.error('Green body preservation requires the base green key without aggressive cleanup/despill flags.')
    if SCREEN_BACKGROUND_FALLBACK is not None and any(value < 0 or value > 255 for value in SCREEN_BACKGROUND_FALLBACK):
        parser.error('Screen background fallback RGB values must be in 0..255.')
    if SCREEN_COLOUR == 'blue' and (args.screen_dominance_cleanup or args.screen_fringe_cleanup or args.warm_dust_despill):
        parser.error('Green-specific cleanup/despill flags cannot be used with a blue screen.')
    WARM_DUST_DESPILL = args.warm_dust_despill
    def select_key_profile(action: str) -> None:
        global SCREEN_DOMINANCE_CLEANUP, SCREEN_FRINGE_CLEANUP, PRESERVE_SATURATED_GREEN_BODY
        SCREEN_DOMINANCE_CLEANUP = args.screen_dominance_cleanup and action not in args.base_key_actions
        SCREEN_FRINGE_CLEANUP = args.screen_fringe_cleanup and action not in args.base_key_actions
        PRESERVE_SATURATED_GREEN_BODY = args.preserve_saturated_green_body and action in args.saturated_green_body_actions
    if args.species_id <= 0:
        parser.error('Species ID must be positive.')
    args.source_dir = args.source_dir or Path(f'animation-source/raw/{args.species_id}/front')
    args.output = args.output or Path(f'public/sprites/arkamon/{args.species_id}/front')
    if args.base_cell < 64 or args.max_texture < args.base_cell or args.columns < 0 or args.padding < 0:
        parser.error('Base cell must be at least64, texture must fit it, and columns/padding must be nonnegative.')
    if not 0 < args.occupancy <= 1 or not 0 < args.ground <= 1 or not 0 <= args.alpha_cutoff < 1:
        parser.error('Occupancy/ground must be in(0,1], alpha cutoff in[0,1).')
    try:
        actions = conversion_actions(args.actions, bool(args.reuse_normalization))
    except ValueError as error:
        parser.error(str(error))
    ffmpeg = ffmpeg_path(args.ffmpeg)
    output = args.output.resolve()
    output.mkdir(parents=True,exist_ok=True)
    qa = args.qa_dir.resolve() if args.qa_dir else None
    if qa:
        qa.mkdir(parents=True,exist_ok=True)
    decoded = args.decoded_dir.resolve() if args.decoded_dir else Path('__no_decode_cache__')
    with tempfile.TemporaryDirectory(prefix='arkamon-all-original-frames-') as folder:
        clips = []
        for action in actions:
            select_key_profile(action)
            clips.append(inspect_clip(ffmpeg,(args.source_dir/f'{action}.mp4').resolve(),action,decoded,Path(folder),args.alpha_cutoff))
        if args.reuse_normalization:
            common = reuse_normalization(clips,args.reuse_normalization.resolve(),args.species_id)
        else:
            common = common_plan(clips,args.reference,args.base_cell,args.ground,args.occupancy,args.padding,args.max_texture,args.fit_initial_body)
            common['cameraCalibrations'] = {c['action']:c['camera'] for c in clips}
        common_path = output/'animation-set.normalization.json'
        common_path.write_text(json.dumps(common,indent=2)+'\n',encoding='utf-8')
        if qa:
            (qa/'common-normalization.json').write_text(json.dumps(common,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'commonNormalization':common}),flush=True)
        if args.analyze_only:
            return
        all_metadata,idle_first = {},None
        if args.reuse_normalization and 'idle' not in actions:
            with Image.open(args.reuse_normalization/'idle-poster.webp') as poster:
                idle_first = poster.convert('RGBA')
        for clip in clips:
            select_key_profile(clip['action'])
            metadata,first = convert_clip(clip,common,output,qa,ffmpeg,args.battle_background,args.alpha_cutoff,args.columns,idle_first,args.species_id)
            all_metadata[clip['action']] = metadata
            if clip['action']=='idle':
                idle_first = first
            (output/'animation-set.metadata.json').write_text(json.dumps({'schemaVersion':1,'speciesId':args.species_id,'view':'front','normalization':common,'actions':all_metadata},indent=2)+'\n',encoding='utf-8')
        if qa:
            cell = common['cellWidth']
            contact = Image.new('RGB',(cell*len(clips),cell+28),(239,243,248))
            draw = ImageDraw.Draw(contact)
            for i,clip in enumerate(clips):
                poster = Image.open(output/f"{clip['action']}-poster.webp").convert('RGBA')
                contact.paste(poster,(i*cell,0),poster)
                draw.text((i*cell+12,cell+6),f"{clip['action']} initial pose / common ground",fill=(20,30,42))
            contact.save(qa/'initial-poses-common-canvas.jpg',quality=96,subsampling=0)


if __name__ == '__main__':
    main()
