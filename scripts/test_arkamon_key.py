#!/usr/bin/env python3
"""Regression tests for opt-in fringe keying and source-verified atlas geometry.

Run with Python, Pillow and NumPy: python scripts/test_arkamon_key.py
The suite uses small synthetic RGB fixtures; no FFmpeg or external media needed.
"""
from __future__ import annotations

import colorsys
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

_spec = importlib.util.spec_from_file_location('arkamon_key', Path(__file__).with_name('build-arkamon-idle.py'))
converter = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(converter)


def source_patch(colour: tuple[int, int, int]) -> Image.Image:
    image = Image.new('RGB', (128, 128), (20, 180, 40))
    image.paste(colour, (48, 48, 80, 80))
    return image


class LosslessEncodingTests(unittest.TestCase):
    def test_fast_and_historical_compression_retain_exact_rgba_and_alpha(self) -> None:
        rng = np.random.default_rng(42)
        pixels = rng.integers(0,256,(48,64,4),dtype=np.uint8)
        pixels[:8,:,3]=0
        pixels[-8:,:,3]=255
        image=Image.fromarray(pixels)
        with tempfile.TemporaryDirectory() as temporary:
            for method in [0,1,4]:
                path=Path(temporary)/f'method-{method}.webp'
                converter.save_lossless_webp(image,path,method)
                with Image.open(path) as decoded:
                    np.testing.assert_array_equal(np.asarray(decoded.convert('RGBA')),pixels)

    def test_invalid_compression_effort_fails_before_writing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary)/'invalid.webp'
            with self.assertRaisesRegex(ValueError,'0..6'):
                converter.save_lossless_webp(Image.new('RGBA',(4,4)),path,7)
            self.assertFalse(path.exists())


class ReusedActionSelectionTests(unittest.TestCase):
    def test_new_set_requires_idle_to_establish_its_geometry(self) -> None:
        with self.assertRaisesRegex(ValueError, 'Include idle'):
            converter.conversion_actions(['ko'],False)

    def test_reusing_geometry_keeps_only_requested_actions_without_rekeying_idle(self) -> None:
        self.assertEqual(converter.conversion_actions(['ko','ko'],True),['ko'])
        self.assertEqual(converter.conversion_actions(['hit','attack'],True),['hit','attack'])

    def test_supplied_idle_remains_first_and_duplicates_are_removed(self) -> None:
        self.assertEqual(converter.conversion_actions(['ko','idle','attack','idle'],False),['idle','ko','attack'])


class BlueScreenKeyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.previous = (converter.SCREEN_COLOUR, converter.SCREEN_DOMINANCE_CLEANUP, converter.SCREEN_FRINGE_CLEANUP)
        converter.SCREEN_COLOUR = 'blue'
        converter.SCREEN_DOMINANCE_CLEANUP = converter.SCREEN_FRINGE_CLEANUP = False

    def tearDown(self) -> None:
        converter.SCREEN_COLOUR, converter.SCREEN_DOMINANCE_CLEANUP, converter.SCREEN_FRINGE_CLEANUP = self.previous

    def test_blue_screen_and_enclosed_pocket_become_transparent(self) -> None:
        image = Image.new('RGB', (128,128), (8,12,245))
        image.paste((80,155,45), (32,32,96,96))
        image.paste((8,12,245), (55,55,70,70))
        keyed, _ = converter.remove_green(image)
        pixels = np.asarray(keyed)
        self.assertTrue(np.all(pixels[:32] == 0))
        self.assertTrue(np.all(pixels[55:70,55:70] == 0))
        np.testing.assert_array_equal(pixels[40,40], [80,155,45,255])

    def test_green_foliage_red_fire_and_dark_details_keep_exact_rgb(self) -> None:
        for colour in [(50,170,40),(135,155,55),(225,85,30),(35,30,32)]:
            with self.subTest(colour=colour):
                image = Image.new('RGB',(128,128),(8,12,245))
                image.paste(colour,(48,48,80,80))
                keyed, _ = converter.remove_green(image)
                np.testing.assert_array_equal(np.asarray(keyed)[64,64], [*colour,255])

    def test_normalization_preserves_green_interior_instead_of_legacy_green_despill(self) -> None:
        image = Image.new('RGB',(128,128),(8,12,245))
        image.paste((50,170,40),(48,48,80,80))
        clip = {'action':'idle','union':(48,48,80,80),'camera':{'nativeToIdleCoordinateScale':1,'nativeToIdleCoordinateOffset':[0,0]}}
        common = {'sharedScale':1,'logicalCanvasOrigin':[0,0],'viewport':{'left':0,'top':0},'cellWidth':128,'cellHeight':128}
        result = converter.normalize_frame(image,clip,common,.08)
        np.testing.assert_array_equal(np.asarray(result)[64,64], [50,170,40,255])
        self.assertIsNone(result.getchannel('A').crop((0,0,32,32)).getbbox())

    def test_wrong_screen_channel_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, 'not sufficiently blue'):
            converter.remove_green(source_patch((125,55,170)))

    def test_explicit_clip_screen_preserves_a_flash_covering_the_corners(self) -> None:
        with patch.object(converter, 'SCREEN_BACKGROUND_FALLBACK', (8,12,245)):
            image = Image.new('RGB',(128,128),(252,253,251))
            keyed, _ = converter.remove_green(image)
            np.testing.assert_array_equal(np.asarray(keyed)[64,64], [252,253,251,255])
            self.assertEqual(keyed.getchannel('A').getbbox(),(0,0,128,128))

    def test_fallback_does_not_override_a_visible_native_screen(self) -> None:
        with patch.object(converter, 'SCREEN_BACKGROUND_FALLBACK', (8,12,245)):
            image = Image.new('RGB',(128,128),(14,18,210))
            image.paste((50,170,40),(48,48,80,80))
            rgb, alpha, background = converter.key_alpha(image)
            np.testing.assert_array_equal(background, [14,18,210])
            self.assertEqual(float(alpha[0,0]),0)
            self.assertEqual(float(alpha[64,64]),1)

    def test_soft_blue_ratio_retains_a_gradual_native_aura_without_keying_green_body(self) -> None:
        image=Image.new('RGB',(128,128),(0,0,255))
        for index,value in enumerate([4,6,12,20,28]):
            image.paste((value,value,200),(32+index*10,48,42+index*10,70))
        image.paste((50,170,40),(48,80,80,100))
        _,hard,_=converter.key_alpha(image,cutoff=.02)
        with patch.object(converter,'SOFT_BLUE_SCREEN_REJECTION',True):
            rgb,soft,_=converter.key_alpha(image,cutoff=.02)
            keyed,_=converter.remove_green(image,cutoff=.02)
        self.assertEqual(float(hard[60,66]),0)
        samples=[float(soft[60,36+index*10]) for index in range(5)]
        self.assertEqual(samples[0],0)
        self.assertTrue(all(a<b for a,b in zip(samples,samples[1:])),samples)
        self.assertEqual(float(soft[0,0]),0)
        np.testing.assert_array_equal(np.asarray(keyed)[90,64],[50,170,40,255])


class GreenBodyPreservationTests(unittest.TestCase):
    def test_audited_green_grey_body_retains_opaque_source_colour(self) -> None:
        with patch.object(converter,'PRESERVE_GREEN_BODY',True):
            for colour in [(120,140,125),(70,110,80),(140,175,155)]:
                image=source_patch(colour)
                keyed,_=converter.remove_green(image)
                np.testing.assert_array_equal(np.asarray(keyed)[64,64],[*colour,255])

    def test_screen_pocket_and_mixed_edge_keep_their_alpha(self) -> None:
        image=source_patch((120,140,125))
        image.paste((20,180,40),(58,58,70,70))
        image.paste((40,150,65),(48,48,50,80))
        _,legacy,_=converter.key_alpha(image)
        with patch.object(converter,'PRESERVE_GREEN_BODY',True):
            _,alpha,_=converter.key_alpha(image)
        self.assertEqual(float(alpha[64,64]),0)
        self.assertAlmostEqual(float(alpha[60,49]),float(legacy[60,49]))
        self.assertEqual(float(alpha[52,60]),1)

    def test_resize_despill_preserves_opaque_green_interior(self) -> None:
        image=source_patch((120,140,125))
        clip={'action':'idle','union':(48,48,80,80),'camera':{'nativeToIdleCoordinateScale':1,'nativeToIdleCoordinateOffset':[0,0]}}
        common={'sharedScale':1,'logicalCanvasOrigin':[0,0],'viewport':{'left':0,'top':0},'cellWidth':128,'cellHeight':128}
        with patch.object(converter,'PRESERVE_GREEN_BODY',True):
            frame=converter.normalize_frame(image,clip,common,.08)
        np.testing.assert_array_equal(np.asarray(frame)[64,64],[120,140,125,255])


class SaturatedGreenBodyPreservationTests(unittest.TestCase):
    @staticmethod
    def image(colour: tuple[int, int, int]) -> Image.Image:
        image = Image.new('RGB', (128, 128), (31, 246, 23))
        image.paste(colour, (32, 32, 96, 96))
        return image

    def test_native_green_gradients_keep_exact_opaque_rgb_only_when_opted_in(self) -> None:
        for colour in [(90, 210, 100), (120, 230, 60), (120, 200, 155)]:
            with self.subTest(colour=colour):
                image = self.image(colour)
                _, legacy, _ = converter.key_alpha(image)
                self.assertLess(float(legacy[64, 64]), 1)
                with patch.object(converter, 'PRESERVE_SATURATED_GREEN_BODY', True):
                    keyed, _ = converter.remove_green(image)
                np.testing.assert_array_equal(np.asarray(keyed)[64, 64], [*colour, 255])

    def test_uniform_shadowed_and_enclosed_screen_pockets_stay_transparent(self) -> None:
        image = self.image((120, 230, 60))
        image.paste((31, 246, 23), (56, 56, 72, 72))
        image.paste((20, 159, 15), (40, 40, 48, 48))
        with patch.object(converter, 'PRESERVE_SATURATED_GREEN_BODY', True):
            keyed, _ = converter.remove_green(image)
        pixels = np.asarray(keyed)
        self.assertTrue(np.all(pixels[:24] == 0))
        self.assertTrue(np.all(pixels[56:72, 56:72] == 0))
        self.assertTrue(np.all(pixels[40:48, 40:48] == 0))

    def test_mixed_edges_thin_fringe_and_low_coverage_fades_keep_base_alpha(self) -> None:
        image = self.image((120, 230, 60))
        image.paste((76, 238, 42), (30, 32, 32, 96))
        image.paste((120, 230, 60), (24, 32, 26, 96))
        image.paste((93, 235, 49), (50, 50, 78, 78))
        _, baseline, _ = converter.key_alpha(image)
        with patch.object(converter, 'PRESERVE_SATURATED_GREEN_BODY', True):
            _, actual, _ = converter.key_alpha(image)
        np.testing.assert_array_equal(actual[32:96, 30:32], baseline[32:96, 30:32])
        np.testing.assert_array_equal(actual[32:96, 24:26], baseline[32:96, 24:26])
        np.testing.assert_array_equal(actual[50:78, 50:78], baseline[50:78, 50:78])
        self.assertGreater(float(actual[42, 42]), float(baseline[42, 42]))

    def test_normalization_despill_retains_opaque_native_green(self) -> None:
        colour = (120, 230, 60)
        image = self.image(colour)
        clip = {'action': 'idle', 'union': (32, 32, 96, 96), 'camera': {'nativeToIdleCoordinateScale': 1, 'nativeToIdleCoordinateOffset': [0, 0]}}
        common = {'sharedScale': 1, 'logicalCanvasOrigin': [0, 0], 'viewport': {'left': 0, 'top': 0}, 'cellWidth': 128, 'cellHeight': 128}
        with patch.object(converter, 'PRESERVE_SATURATED_GREEN_BODY', True):
            frame = converter.normalize_frame(image, clip, common, .08)
        np.testing.assert_array_equal(np.asarray(frame)[64, 64], [*colour, 255])

    def test_green_profile_rejects_blue_screen_and_aggressive_cleanup(self) -> None:
        for options in [('--screen-colour', 'blue'), ('--screen-fringe-cleanup',), ('--screen-dominance-cleanup',), ('--warm-dust-despill',)]:
            with self.subTest(options=options), patch.object(sys, 'argv', ['build-arkamon-idle.py', '--preserve-saturated-green-body', *options]), contextlib.redirect_stderr(io.StringIO()), patch.object(converter, 'PRESERVE_SATURATED_GREEN_BODY', False), patch.object(converter, 'SCREEN_COLOUR', 'green'):
                with self.assertRaises(SystemExit) as error:
                    converter.main()
                self.assertEqual(error.exception.code, 2)

    def test_written_metadata_distinguishes_soft_blue_and_native_green_profiles(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            common = {'cellWidth': 128, 'cellHeight': 128, 'viewport': {'width': 128, 'height': 128, 'left': 0, 'top': 0},
                      'sharedScale': 1, 'logicalCanvasOrigin': [0, 0], 'groundPivot': [64, 96], 'maxTextureDimension': 8192}
            for screen, saturated in [('blue', False), ('green', True)]:
                with self.subTest(screen=screen), contextlib.ExitStack() as stack:
                    for name, value in [('SCREEN_COLOUR', screen), ('SOFT_BLUE_SCREEN_REJECTION', screen == 'blue'),
                                        ('PRESERVE_SATURATED_GREEN_BODY', saturated), ('PRESERVE_GREEN_BODY', False),
                                        ('SCREEN_DOMINANCE_CLEANUP', False), ('SCREEN_FRINGE_CLEANUP', False), ('WEBP_METHOD', 0)]:
                        stack.enter_context(patch.object(converter, name, value))
                    stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
                    source = Image.new('RGB', (128, 128), (8, 12, 245) if screen == 'blue' else (31, 246, 23))
                    source.paste((120, 230, 60), (32, 32, 96, 96))
                    filename = folder/f'{screen}.png'
                    source.save(filename)
                    clip = {'action': 'idle', 'info': {'width': 128, 'height': 128, 'fps': 24}, 'paths': [filename, filename],
                            'union': (0, 0, 128, 128), 'boxes': [(32, 32, 96, 96)]*2,
                            'camera': {'nativeToIdleCoordinateScale': 1, 'nativeToIdleCoordinateOffset': [0, 0]}}
                    metadata, _ = converter.convert_clip(clip, common, folder, None, '', None, .08, 2, None, 130)
                    self.assertEqual('softBlueScreenRejection' in metadata['key'], screen == 'blue')
                    self.assertEqual('preserveSaturatedGreenBody' in metadata['key'], saturated)
                    self.assertTrue(metadata['qa']['nativeGreenPixelsAllowed'])

    def test_action_scope_applies_in_analysis_and_conversion_without_recolouring_fx(self) -> None:
        observed = []
        def inspect(_ffmpeg, _source, action, *_rest):
            observed.append(('analysis', action, converter.PRESERVE_SATURATED_GREEN_BODY))
            return {'action': action, 'camera': {}}
        def convert(clip, *_rest):
            observed.append(('conversion', clip['action'], converter.PRESERVE_SATURATED_GREEN_BODY))
            return {'action': clip['action']}, Image.new('RGBA', (64, 64))
        with tempfile.TemporaryDirectory() as tmp, contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(sys, 'argv', ['converter', '--output', tmp, '--actions', 'idle', 'attack', 'ko',
                                                         '--preserve-saturated-green-body', '--saturated-green-body-actions', 'idle']))
            stack.enter_context(patch.object(converter, 'PRESERVE_SATURATED_GREEN_BODY', False))
            stack.enter_context(patch.object(converter, 'ffmpeg_path', return_value='unused'))
            stack.enter_context(patch.object(converter, 'inspect_clip', side_effect=inspect))
            stack.enter_context(patch.object(converter, 'common_plan', return_value={'cellWidth': 64}))
            stack.enter_context(patch.object(converter, 'convert_clip', side_effect=convert))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            converter.main()
        self.assertEqual(observed, [('analysis', 'idle', True), ('analysis', 'attack', False), ('analysis', 'ko', False),
                                    ('conversion', 'idle', True), ('conversion', 'attack', False), ('conversion', 'ko', False)])


class FringeKeyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.previous = (converter.SCREEN_DOMINANCE_CLEANUP, converter.SCREEN_FRINGE_CLEANUP)
        converter.SCREEN_DOMINANCE_CLEANUP = False
        converter.SCREEN_FRINGE_CLEANUP = False

    def tearDown(self) -> None:
        converter.SCREEN_DOMINANCE_CLEANUP, converter.SCREEN_FRINGE_CLEANUP = self.previous

    def test_opt_in_removes_yellow_and_olive_that_legacy_key_retains(self) -> None:
        for colour in [(130, 125, 20), (105, 115, 24), (145, 130, 35)]:
            with self.subTest(colour=colour):
                converter.SCREEN_FRINGE_CLEANUP = False
                _, legacy, _ = converter.key_alpha(source_patch(colour))
                self.assertGreater(float(legacy[64, 64]), .85)
                converter.SCREEN_FRINGE_CLEANUP = True
                _, cleaned, _ = converter.key_alpha(source_patch(colour))
                self.assertEqual(float(cleaned[64, 64]), 0)

    def test_enclosed_screen_pocket_is_removed_without_eroding_dark_surround(self) -> None:
        image = source_patch((65, 65, 68))
        image.paste((130, 125, 20), (58, 58, 70, 70))
        converter.SCREEN_FRINGE_CLEANUP = True
        keyed, _ = converter.remove_green(image)
        pixels = np.asarray(keyed)
        self.assertTrue(np.all(pixels[58:70, 58:70] == 0))
        np.testing.assert_array_equal(pixels[50, 50], [65, 65, 68, 255])

    def test_alpha_fades_continuously_over_35_to_45_degrees(self) -> None:
        hues = [35, 37.5, 40, 42.5, 45]
        colours = np.array([[colorsys.hsv_to_rgb(h/360, .8, 180) for h in hues]], dtype=np.float32)
        mask, coverage = converter.screen_fringe_mask(colours)
        self.assertTrue(mask.all())
        np.testing.assert_allclose(coverage[0], [1, .75, .5, .25, 0], atol=1e-5)
        self.assertTrue(np.all(np.diff(coverage[0]) < 0))

    def test_neutral_dark_red_purple_and_orange_pixels_are_preserved_exactly(self) -> None:
        converter.SCREEN_FRINGE_CLEANUP = True
        for colour in [(70, 70, 74), (210, 35, 55), (125, 55, 170), (180, 90, 22)]:
            with self.subTest(colour=colour):
                keyed, _ = converter.remove_green(source_patch(colour))
                np.testing.assert_array_equal(np.asarray(keyed)[64, 64], [*colour, 255])

    def test_bright_and_medium_warm_hit_light_survive_yellow_fringe_profile(self) -> None:
        converter.SCREEN_FRINGE_CLEANUP = True
        for colour in [(240, 236, 35), (205, 180, 25), (255, 252, 190)]:
            with self.subTest(colour=colour):
                mask, _ = converter.screen_fringe_mask(np.array([[colour]], dtype=np.float32))
                self.assertFalse(mask[0, 0])
                keyed, _ = converter.remove_green(source_patch(colour))
                np.testing.assert_array_equal(np.asarray(keyed)[64, 64], [*colour, 255])

    def test_default_off_retains_legacy_green_feature_coverage(self) -> None:
        image = source_patch((120, 140, 45))
        _, legacy, _ = converter.key_alpha(image)
        # Keep the pre-existing key behaviour for characters with green details.
        self.assertAlmostEqual(float(legacy[64, 64]), 1-20/140, places=6)
        self.assertGreater(float(legacy[64, 64]), .8)
        converter.SCREEN_FRINGE_CLEANUP = True
        _, opted_in, _ = converter.key_alpha(image)
        self.assertEqual(float(opted_in[64, 64]), 0)

    def test_only_screen_like_saturated_colours_enter_fringe_mask(self) -> None:
        colours = np.array([[(18, 20, 4), (160, 156, 155), (55, 80, 170), (180, 90, 22)]], dtype=np.float32)
        mask, _ = converter.screen_fringe_mask(colours)
        self.assertFalse(mask.any())

    def test_action_profile_preserves_neutral_smoke_and_cyan_trails(self) -> None:
        converter.SCREEN_FRINGE_CLEANUP = False
        image = source_patch((50, 140, 90))
        _, original, _ = converter.key_alpha(image)
        converter.SCREEN_FRINGE_CLEANUP = True
        _, idle, _ = converter.key_alpha(image)
        _, action, _ = converter.key_alpha(image, preserve_effects=True)
        self.assertEqual(float(idle[64,64]), 0)
        np.testing.assert_array_equal(action, original)
        _, pocket, _ = converter.key_alpha(source_patch((130,125,20)), preserve_effects=True)
        self.assertEqual(float(pocket[64,64]), 0)

    def test_action_gold_bloom_is_local_and_does_not_protect_unlit_screen_fringe(self) -> None:
        rgb = np.full((48,48,3), (130,125,20), dtype=np.float32)
        rgb[24,24] = (240,230,30)
        rgb[24,28] = (180,174,35)
        broad, _ = converter.screen_fringe_mask(rgb)
        action, _ = converter.screen_fringe_mask(rgb, preserve_effects=True)
        self.assertTrue(broad[24,28])
        self.assertFalse(action[24,28])
        self.assertTrue(action[24,34])
        rgb[24,28] = (100,170,20)
        action, _ = converter.screen_fringe_mask(rgb, preserve_effects=True)
        self.assertTrue(action[24,28])

    def test_hit_keeps_previously_visible_pale_dust_without_restoring_olive(self) -> None:
        converter.SCREEN_DOMINANCE_CLEANUP = True
        image = source_patch((190,210,165))
        _, original, _ = converter.key_alpha(image)
        converter.SCREEN_FRINGE_CLEANUP = True
        _, attack, _ = converter.key_alpha(image, **converter.action_key_options('attack'))
        _, hit, _ = converter.key_alpha(image, **converter.action_key_options('hit'))
        self.assertEqual(float(attack[64,64]), 0)
        np.testing.assert_array_equal(hit, original)
        _, olive, _ = converter.key_alpha(source_patch((130,125,20)), **converter.action_key_options('hit'))
        self.assertEqual(float(olive[64,64]), 0)

    def test_victory_protects_warm_cores_without_growing_an_olive_aura(self) -> None:
        rgb = np.full((48,48,3), (130,125,20), dtype=np.float32)
        rgb[24,24] = (240,230,30)
        rgb[24,28] = (180,174,35)
        attack, _ = converter.screen_fringe_mask(rgb, **converter.action_key_options('attack'))
        victory, _ = converter.screen_fringe_mask(rgb, **converter.action_key_options('victory'))
        self.assertFalse(attack[24,28])
        self.assertTrue(victory[24,28])
        self.assertFalse(victory[24,24])


class ReferenceGeometryTests(unittest.TestCase):
    def plan(self, size: tuple[int, int], rectangle: tuple[int, int, int, int]) -> dict:
        with tempfile.TemporaryDirectory(prefix='arkamon-reference-fit-') as temporary:
            reference = Path(temporary)/'reference.png'
            image = Image.new('RGBA', size, (0, 0, 0, 0))
            image.paste((120, 60, 160, 255), rectangle)
            image.save(reference)
            clip = {
                'action': 'idle', 'firstCore': (10, 20, 90, 100),
                'union': (10, 20, 90, 100), 'boxes': [(10, 20, 90, 100)],
                'paths': [None]*96, 'info': {'width': 100, 'height': 100},
            }
            return converter.common_plan([clip], reference, 100, 1, .8, 16, 8192)

    def test_rectangular_reference_matches_centered_contain_ground_and_body_height(self) -> None:
        # Wide static art occupies y=25..75 in a square slot; its opaque body ends at70.
        wide = self.plan((200, 100), (20, 10, 180, 90))
        self.assertEqual(wide['groundPivot'][1]-wide['viewport']['top'], 70)
        self.assertEqual(wide['idleBodyHeightOutputPixels'], 40)
        self.assertEqual(wide['logicalUnionAlphaBounds'], [30, 30, 70, 70])
        # Tall art already fills the slot height, with its body ending at90.
        tall = self.plan((100, 200), (10, 20, 90, 180))
        self.assertEqual(tall['groundPivot'][1]-tall['viewport']['top'], 90)
        self.assertEqual(tall['idleBodyHeightOutputPixels'], 80)

    def test_square_reference_keeps_its_existing_scale_and_ground(self) -> None:
        square = self.plan((100, 100), (10, 20, 90, 100))
        self.assertEqual(square['sharedScale'], 1)
        self.assertEqual(square['groundPivot'][1]-square['viewport']['top'], 100)
        self.assertEqual(square['idleBodyHeightOutputPixels'], 80)
        self.assertEqual(square['logicalUnionAlphaBounds'], [10, 20, 90, 100])


class ReuseGeometryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix='arkamon-key-regression-')
        self.folder = Path(self.temporary.name)
        self.common = {'cellWidth':64, 'cellHeight':64, 'viewport':{'width':48, 'height':48, 'left':8, 'top':8},
                       'sharedScale':1.0, 'logicalCanvasOrigin':[-40, -40], 'groundPivot':[32,56],
                       'maxTextureDimension':8192, 'referenceAction':'idle', 'paddingPixels':8}
        self.camera = {'nativeToIdleCoordinateScale':1.0, 'nativeToIdleCoordinateOffset':[0,0],
                       'constantForEntireClip':True, 'initialBodyCoreBounds':[48,48,80,80]}
        self.timing = {'releaseFrame':47, 'releaseMs':47/24*1000, 'evidence':'Fixture release marker'}
        self.paths = []
        for i in range(96):
            image = source_patch((60+i, 45, 60))
            # Legacy crop includes a screen-coloured ring that the new profile removes.
            image.paste((130,125,20), (40,40,88,88))
            image.paste((60+i,45,60), (48,48,80,80))
            path = self.folder/f'frame-{i:04d}.png'
            image.save(path)
            self.paths.append(path)
        self.info = {'sha256':'original-source-hash', 'width':128, 'height':128, 'fps':24.0,
                     'decodedFrameCount':96, 'durationFromFramesSeconds':4.0}
        self.old = {'speciesId':6, 'action':'attack', 'source':copy.deepcopy(self.info),
                    'sheet':{'frameCount':96, 'fps':24.0, 'columns':10},
                    'transform':{'sharedTransform':copy.deepcopy(self.common), 'sourceUnionAlphaBounds':[40,40,88,88],
                                 'cameraCalibration':copy.deepcopy(self.camera)}, 'timing':copy.deepcopy(self.timing)}
        (self.folder/'animation-set.normalization.json').write_text(json.dumps(self.common), encoding='utf-8')
        (self.folder/'attack.metadata.json').write_text(json.dumps(self.old), encoding='utf-8')
        self.clip = {'action':'attack', 'info':copy.deepcopy(self.info), 'paths':self.paths,
                     'union':(48,48,80,80), 'boxes':[(48,48,80,80)]*96}
        self.previous = (converter.SCREEN_DOMINANCE_CLEANUP, converter.SCREEN_FRINGE_CLEANUP)
        converter.SCREEN_DOMINANCE_CLEANUP = False
        converter.SCREEN_FRINGE_CLEANUP = True

    def tearDown(self) -> None:
        converter.SCREEN_DOMINANCE_CLEANUP, converter.SCREEN_FRINGE_CLEANUP = self.previous
        self.temporary.cleanup()

    def test_refuses_to_reuse_geometry_from_a_different_original_source(self) -> None:
        self.clip['info']['sha256'] = 'changed-source-hash'
        with self.assertRaisesRegex(ValueError, 'source or metadata differs'):
            converter.reuse_normalization([self.clip], self.folder, 6)

    def test_refuses_changed_fps_count_dimensions_or_species(self) -> None:
        for field, value in [('fps',30.0), ('width',256), ('height',256)]:
            with self.subTest(field=field):
                changed = copy.deepcopy(self.clip)
                changed['info'][field] = value
                with self.assertRaises(ValueError):
                    converter.reuse_normalization([changed], self.folder, 6)
        short = copy.deepcopy(self.clip)
        short['paths'] = short['paths'][:-1]
        with self.assertRaises(ValueError):
            converter.reuse_normalization([short], self.folder, 6)
        with self.assertRaises(ValueError):
            converter.reuse_normalization([self.clip], self.folder, 7)

    def test_refuses_to_clip_new_content_outside_the_existing_crop(self) -> None:
        self.clip['union'] = (39,48,80,80)
        with self.assertRaisesRegex(ValueError, 'exceed the previous source crop'):
            converter.reuse_normalization([self.clip], self.folder, 6)

    def test_valid_rekey_preserves_geometry_all_native_frames_and_release_marker(self) -> None:
        common = converter.reuse_normalization([self.clip], self.folder, 6)
        self.assertEqual(common, self.common)
        self.assertEqual(self.clip['union'], (40,40,88,88))
        self.assertEqual(self.clip['camera'], self.camera)
        output = self.folder/'converted'
        output.mkdir()
        with contextlib.redirect_stdout(io.StringIO()):
            metadata, _ = converter.convert_clip(self.clip, common, output, None, '', None, .08, 0, None, 6)
        self.assertEqual(metadata['timing'], self.timing)
        self.assertEqual(metadata['transform']['sharedTransform'], self.common)
        self.assertEqual(metadata['transform']['cameraCalibration'], self.camera)
        self.assertEqual(metadata['transform']['sourceUnionAlphaBounds'], [40,40,88,88])
        self.assertEqual(metadata['sampling']['sourceFrameIndices'], list(range(96)))
        self.assertEqual(metadata['sheet']['frameCount'], 96)
        self.assertEqual(metadata['sheet']['fps'], 24.0)
        self.assertEqual(metadata['sheet']['durationMs'], 4000)
        self.assertEqual(metadata['sheet']['viewport'], self.common['viewport'])
        self.assertEqual((metadata['sheet']['cellWidth'], metadata['sheet']['columns']), (64,10))
        with Image.open(output/'attack.webp') as atlas:
            self.assertEqual(atlas.size, (640,640))
            for i in range(96):
                cell = atlas.crop((i%10*64, i//10*64, i%10*64+64, i//10*64+64))
                self.assertEqual(cell.getchannel('A').getbbox(), (16,16,48,48))
                self.assertEqual(cell.getpixel((32,32)), (60+i,45,60,255))
            for i in range(96,100):
                self.assertIsNone(atlas.crop((i%10*64,i//10*64,i%10*64+64,i//10*64+64)).getchannel('A').getbbox())


class InitialBodyScaleTests(unittest.TestCase):
    def test_warm_dust_despill_removes_olive_without_erasing_particles_or_gold(self) -> None:
        old = converter.WARM_DUST_DESPILL
        try:
            converter.WARM_DUST_DESPILL = False
            before, _ = converter.remove_green(source_patch((185,179,113)))
            converter.WARM_DUST_DESPILL = True
            after, _ = converter.remove_green(source_patch((185,179,113)))
            self.assertEqual(before.getchannel('A').tobytes(), after.getchannel('A').tobytes())
            self.assertEqual(before.getchannel('A').getbbox(), after.getchannel('A').getbbox())
            self.assertEqual(before.getpixel((60,60)), (185,179,113,255))
            self.assertEqual(after.getpixel((60,60)), (185,157,113,255))
            for colour in [(240,234,130),(150,148,144),(40,140,230),(120,90,50)]:
                converter.WARM_DUST_DESPILL = False
                unchanged, _ = converter.remove_green(source_patch(colour))
                converter.WARM_DUST_DESPILL = True
                protected, _ = converter.remove_green(source_patch(colour))
                self.assertEqual(unchanged.tobytes(), protected.tobytes(), colour)
        finally:
            converter.WARM_DUST_DESPILL = old

    def test_action_profile_override_applies_during_analysis_and_conversion(self) -> None:
        observed = []
        def record(stage, action):
            _, alpha, _ = converter.key_alpha(source_patch((110,160,130)))
            observed.append((stage, action, float(alpha[60,60])))
        def inspect(_ffmpeg, _source, action, *_rest):
            record('analysis', action)
            return {'action':action, 'camera':{}}
        def convert(clip, *_rest):
            record('conversion', clip['action'])
            return {'action':clip['action']}, Image.new('RGBA',(64,64))
        old = converter.SCREEN_DOMINANCE_CLEANUP, converter.SCREEN_FRINGE_CLEANUP
        try:
            with tempfile.TemporaryDirectory() as tmp, contextlib.ExitStack() as stack:
                stack.enter_context(patch('sys.argv',['converter','--output',tmp,'--actions','idle','ko',
                                                      '--screen-dominance-cleanup','--base-key-actions','ko']))
                stack.enter_context(patch.object(converter,'ffmpeg_path',return_value='unused'))
                stack.enter_context(patch.object(converter,'inspect_clip',side_effect=inspect))
                stack.enter_context(patch.object(converter,'common_plan',return_value={'cellWidth':64}))
                stack.enter_context(patch.object(converter,'convert_clip',side_effect=convert))
                stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
                converter.main()
            self.assertEqual([(stage, action) for stage,action,_ in observed],
                             [('analysis','idle'),('analysis','ko'),('conversion','idle'),('conversion','ko')])
            self.assertEqual(observed[0][2], 0)
            self.assertEqual(observed[2][2], 0)
            self.assertGreater(observed[1][2], .5)
            self.assertEqual(observed[1][2], observed[3][2])
        finally:
            converter.SCREEN_DOMINANCE_CLEANUP, converter.SCREEN_FRINGE_CLEANUP = old

    def test_distant_idle_particles_keep_their_padding_without_shrinking_the_body(self) -> None:
        # The native idle has rocks far from the initial body, as in Wormaren15.
        clips = [{'action':'idle', 'firstCore':(450,100,950,1000),
                  'union':(0,20,1900,1080), 'boxes':[(450,100,950,1000),(0,20,1900,1080)],
                  'paths':['frame0','frame1'], 'info':{'width':1920,'height':1080}},
                 {'action':'attack', 'firstCore':(300,50,800,950),
                  'union':(0,0,1920,1080), 'boxes':[(300,50,800,950),(0,0,1920,1080)],
                  'paths':['frame0','frame1'], 'info':{'width':1920,'height':1080}}]
        legacy = converter.common_plan(copy.deepcopy(clips), None, 384, .94, .9, 16, 8192)
        fitted = converter.common_plan(clips, None, 384, .94, .9, 16, 8192, True)
        self.assertLess(legacy['idleBodyHeightOutputPixels'], 200)
        self.assertAlmostEqual(fitted['idleBodyHeightOutputPixels'], 384*.9)
        self.assertEqual(fitted['viewport']['width'], 384)
        self.assertGreater(fitted['cellWidth'], 384)
        for clip in clips:
            camera = clip['camera']
            self.assertTrue(camera['constantForEntireClip'])
            self.assertEqual(camera['initialBodyHeightInIdleCoordinates'], 900)
            for box in clip['boxes']:
                scale = camera['nativeToIdleCoordinateScale']
                dx, dy = camera['nativeToIdleCoordinateOffset']
                ox, oy = fitted['logicalCanvasOrigin']
                vp = fitted['viewport']
                left = (box[0]*scale+dx)*fitted['sharedScale']+ox+vp['left']
                top = (box[1]*scale+dy)*fitted['sharedScale']+oy+vp['top']
                right = (box[2]*scale+dx)*fitted['sharedScale']+ox+vp['left']
                bottom = (box[3]*scale+dy)*fitted['sharedScale']+oy+vp['top']
                self.assertGreaterEqual(left, 15)
                self.assertGreaterEqual(top, 15)
                self.assertLessEqual(right, fitted['cellWidth']-15)
                self.assertLessEqual(bottom, fitted['cellHeight']-15)

    def test_body_fitting_still_refuses_a_grid_over_the_texture_limit(self) -> None:
        clips = [{'action':'idle', 'firstCore':(450,100,950,1000),
                  'union':(0,0,1920,1080), 'boxes':[(0,0,1920,1080)],
                  'paths':list(range(96)), 'info':{'width':1920,'height':1080}}]
        with self.assertRaisesRegex(ValueError, 'padded frame grid'):
            converter.common_plan(clips, None, 384, .94, .9, 16, 4096, True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
