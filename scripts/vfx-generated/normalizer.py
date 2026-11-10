"""Conservative, deterministic formatting of generated 4x4 VFX PNG sheets.

This is a post-processing utility, not a renderer. It does not create effects,
reconstruct clipped artwork, adjust hues, or independently center/zoom frames.
The caller must retain the untouched source separately. Pillow and NumPy only.

API: normalize(source, dest) -> a JSON-serializable QA dictionary.
CLI: python normalizer.py SOURCE DEST [--qa-json PATH]
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


GRID = 4
CELL_SIZE = 512
SHEET_SIZE = GRID * CELL_SIZE
CONTENT_SIZE = 416
MARGIN = (CELL_SIZE - CONTENT_SIZE) // 2
ALPHA_MINIMUM = 13
GRID_EDGE_BAND = 2
GRID_MAX_ALPHA = 32
STRONG_ALPHA = 64


def _box(width: int, height: int, index: int) -> tuple[int, int, int, int]:
    row, col = divmod(index, GRID)
    return (
        round(width * col / GRID),
        round(height * row / GRID),
        round(width * (col + 1) / GRID),
        round(height * (row + 1) / GRID),
    )


def _edge_mask(height: int, width: int, band: int) -> np.ndarray:
    mask = np.zeros((height, width), dtype=bool)
    mask[:band, :] = True
    mask[-band:, :] = True
    mask[:, :band] = True
    mask[:, -band:] = True
    return mask


def _bbox(alpha: np.ndarray) -> list[int] | None:
    ys, xs = np.nonzero(alpha)
    if len(xs) == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def normalize(source: str | Path, dest: str | Path) -> dict:
    """Normalize an existing alpha sheet without redraw or per-frame autozoom.

    All cells use the same source-pixel scale and centered transform. Because
    rounded grid boundaries can create cell widths differing by one pixel,
    smaller cells are centered in one shared source canvas before resizing.
    Alpha 1..12 is suppressed as weak extraction noise. At the two-pixel source
    grid boundary only alpha<=32 may be cleared; stronger artwork is retained.
    Genuine semi-transparency above the threshold and all colors are retained.
    RGB of fully transparent pixels is zeroed to avoid misleading RGB fringes.
    """
    source_path, dest_path = Path(source), Path(dest)
    if source_path.resolve() == dest_path.resolve():
        raise ValueError("Source and destination must differ; preserve the raw PNG.")
    with Image.open(source_path) as opened:
        if "A" not in opened.getbands() and "transparency" not in opened.info:
            raise ValueError("An alpha-bearing source is required; no color-key removal.")
        original = opened.convert("RGBA")
    width, height = original.size
    if width < GRID or height < GRID:
        raise ValueError("Source dimensions cannot contain a 4x4 grid.")

    raw = np.asarray(original)
    raw_alpha = raw[:, :, 3]
    boxes = [_box(width, height, i) for i in range(GRID * GRID)]
    # One common source extent and transform, never measured from effect bboxes.
    common_extent = max(max(x1 - x0, y1 - y0) for x0, y0, x1, y1 in boxes)
    output = Image.new("RGBA", (SHEET_SIZE, SHEET_SIZE), (0, 0, 0, 0))
    frames = []
    edge_frames = []
    suppressed_alpha_mass = 0
    original_kept_alpha_mass = 0
    weak_noise_pixels = 0
    grid_noise_pixels = 0
    warnings = []

    if width != height:
        warnings.append("Non-square source: the same square canvas is used for every cell; verify intended aspect ratio.")

    for index, (x0, y0, x1, y1) in enumerate(boxes):
        frame_number = index + 1
        cell = raw[y0:y1, x0:x1].copy()
        alpha = cell[:, :, 3]
        source_mass = int(alpha.astype(np.uint64).sum())
        edge = _edge_mask(alpha.shape[0], alpha.shape[1], GRID_EDGE_BAND)
        strong_edge_count = int((edge & (alpha >= STRONG_ALPHA)).sum())
        if strong_edge_count and index not in (0, GRID * GRID - 1):
            edge_frames.append(frame_number)

        # Requested empty endpoints are enforced independently of source noise.
        if index in (0, GRID * GRID - 1):
            meaningful_pixels = int((alpha >= ALPHA_MINIMUM).sum())
            if meaningful_pixels:
                warnings.append(f"Frame {frame_number}: nonempty source endpoint was blanked as required ({meaningful_pixels} alpha-bearing pixels).")
            frames.append({
                "frame": frame_number,
                "source_box": [x0, y0, x1, y1],
                "source_alpha_mass": source_mass,
                "source_strong_edge_pixels": strong_edge_count,
                "output_alpha_pixels": 0,
                "output_bbox": None,
                "forced_blank": True,
            })
            continue

        original_kept_alpha_mass += source_mass
        weak = (alpha > 0) & (alpha < ALPHA_MINIMUM)
        grid_noise = edge & (alpha >= ALPHA_MINIMUM) & (alpha <= GRID_MAX_ALPHA)
        weak_noise_pixels += int(weak.sum())
        grid_noise_pixels += int(grid_noise.sum())
        removal = weak | grid_noise
        suppressed_alpha_mass += int(alpha[removal].astype(np.uint64).sum())
        alpha[removal] = 0
        cell[alpha == 0] = 0

        common = Image.new("RGBA", (common_extent, common_extent), (0, 0, 0, 0))
        # Half-pixel centering for 313/314 source cells is uniform at pixel level.
        offset = ((common_extent - cell.shape[1]) // 2, (common_extent - cell.shape[0]) // 2)
        common.paste(Image.fromarray(cell, "RGBA"), offset)
        # Explicit premultiplication prevents invisible RGB from bleeding into
        # visible pixels when scaling semi-transparent edges.
        resized = common.convert("RGBa").resize(
            (CONTENT_SIZE, CONTENT_SIZE), Image.Resampling.LANCZOS
        ).convert("RGBA")
        resized_array = np.asarray(resized).copy()
        resized_alpha = resized_array[:, :, 3]
        # Lanczos can introduce alpha 1..12 at edges; treat that as weak noise too.
        resized_alpha[resized_alpha < ALPHA_MINIMUM] = 0
        resized_array[resized_alpha == 0] = 0
        row, col = divmod(index, GRID)
        output.paste(Image.fromarray(resized_array, "RGBA"), (col * CELL_SIZE + MARGIN, row * CELL_SIZE + MARGIN))
        output_bbox = _bbox(resized_alpha)
        if output_bbox:
            output_bbox = [coordinate + MARGIN for coordinate in output_bbox]
        frames.append({
            "frame": frame_number,
            "source_box": [x0, y0, x1, y1],
            "source_alpha_mass": source_mass,
            "source_strong_edge_pixels": strong_edge_count,
            "weak_noise_pixels_removed": int(weak.sum()),
            "grid_noise_pixels_removed": int(grid_noise.sum()),
            "output_alpha_pixels": int((resized_alpha > 0).sum()),
            "output_bbox": output_bbox,
            "forced_blank": False,
        })

    if edge_frames:
        warnings.append("Strong artwork touches an original cell boundary in frames " + ", ".join(map(str, edge_frames)) + "; normalization preserves it but cannot restore source artwork already clipped or crossing cells.")

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    output.save(dest_path, format="PNG", optimize=True)
    # QA is based on the actual saved file, not the construction assumptions.
    with Image.open(dest_path) as saved:
        saved_mode = saved.mode
        saved_size = list(saved.size)
        saved_array = np.asarray(saved)
    saved_alpha = saved_array[:, :, 3]
    margin_clean = True
    for index in range(GRID * GRID):
        row, col = divmod(index, GRID)
        alpha = saved_alpha[row * CELL_SIZE:(row + 1) * CELL_SIZE, col * CELL_SIZE:(col + 1) * CELL_SIZE]
        if np.any(alpha[_edge_mask(CELL_SIZE, CELL_SIZE, MARGIN)]):
            margin_clean = False
    first_blank = not bool(np.any(saved_alpha[:CELL_SIZE, :CELL_SIZE]))
    last_blank = not bool(np.any(saved_alpha[-CELL_SIZE:, -CELL_SIZE:]))
    nonempty_inner_frames = [entry["frame"] for entry in frames[1:-1] if entry["output_alpha_pixels"] > 0]
    empty_inner_frames = [entry["frame"] for entry in frames[1:-1] if entry["output_alpha_pixels"] == 0]
    # The contract requires 14 visible interior frames plus two empty endpoints.
    # A partially generated sheet cannot pass merely because one cell has signal.
    signal_ok = len(nonempty_inner_frames) == GRID * GRID - 2
    if empty_inner_frames:
        warnings.append("Empty interior frames after cleanup: " + ", ".join(map(str, empty_inner_frames)) + ". Technical QA fails: all 14 interior frames must contain visible alpha.")
    if not np.any(raw_alpha == 0):
        warnings.append("Source has no fully transparent pixels: alpha extraction may be incomplete; inspect backgrounds visually.")

    qa = {
        "normalizer_version": "1.0.1",
        "source": str(source_path.resolve()),
        "destination": str(dest_path.resolve()),
        "source_sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
        "output_sha256": hashlib.sha256(dest_path.read_bytes()).hexdigest(),
        "source_size": [width, height],
        "output_size": saved_size,
        "output_mode": saved_mode,
        "grid": [GRID, GRID],
        "frame_count": GRID * GRID,
        "cell_size": [CELL_SIZE, CELL_SIZE],
        "content_size": [CONTENT_SIZE, CONTENT_SIZE],
        "margin_px": MARGIN,
        "source_common_extent_px": common_extent,
        "common_scale": CONTENT_SIZE / common_extent,
        "alpha_minimum": ALPHA_MINIMUM,
        "weak_noise_pixels_removed": weak_noise_pixels,
        "grid_noise_pixels_removed": grid_noise_pixels,
        "source_alpha_mass_removed_fraction": suppressed_alpha_mass / original_kept_alpha_mass if original_kept_alpha_mass else 0.0,
        "source_edge_contact_frames": edge_frames,
        "first_frame_blank": first_blank,
        "last_frame_blank": last_blank,
        "all_frames_margin_clean": margin_clean,
        "nonempty_inner_frames": nonempty_inner_frames,
        "empty_inner_frames": empty_inner_frames,
        "visual_review_required": True,
        "warnings": warnings,
        "frames": frames,
    }
    qa["technical_passed"] = (
        saved_mode == "RGBA" and saved_size == [SHEET_SIZE, SHEET_SIZE]
        and margin_clean and first_blank and last_blank and signal_ok
    )
    return qa


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("dest")
    parser.add_argument("--qa-json")
    args = parser.parse_args()
    report = normalize(args.source, args.dest)
    serialized = json.dumps(report, ensure_ascii=False, indent=2)
    if args.qa_json:
        qa_path = Path(args.qa_json)
        qa_path.parent.mkdir(parents=True, exist_ok=True)
        qa_path.write_text(serialized + "\n", encoding="utf-8")
    print(serialized)
