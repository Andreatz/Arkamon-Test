import type { SpriteSheetMeta } from '@/components/vfx/types'
import { getNativeRuntimeClip } from './nativeRuntimePages'
import type { SpritePage } from '@/components/vfx/spritePages'

export type ArkamonBattleAnimation =
  | 'idle'
  | 'attack'
  | 'hit'
  | 'ko'
  | 'victory'

export type ArkamonSpriteSide = 'front' | 'back'

export interface ArkamonAnimationAsset extends SpriteSheetMeta {
  src: string
  width: number
  height: number
  durationMs?: number
  loop?: boolean
  pages?: readonly SpritePage[]
  /** Native source frame where an attack releases its effect. */
  releaseFrame?: number
  /** Native source frame where the defender visibly reacts to the impact. */
  reactionFrame?: number
  /** The common battle view inside a padded frame; padding may extend beyond it. */
  viewport?: { width: number; height: number; left: number; top: number }
}

export type ArkamonAnimationSet = Partial<
  Record<ArkamonSpriteSide, Partial<Record<ArkamonBattleAnimation, ArkamonAnimationAsset>>>
>

const FRONT_ANIMATIONS: ArkamonBattleAnimation[] = ['idle', 'attack', 'hit', 'victory', 'ko']

function frontAnimationSet(
  speciesId: number,
  cellSize: number,
  viewport: NonNullable<ArkamonAnimationAsset['viewport']>,
  releaseFrame: number,
  reactionFrame: number,
  frameCounts: Partial<Record<ArkamonBattleAnimation, number>> = {},
): ArkamonAnimationSet {
  const front: Partial<Record<ArkamonBattleAnimation, ArkamonAnimationAsset>> = {}
  for (const animation of FRONT_ANIMATIONS) {
    const frameCount = frameCounts[animation] ?? 96
    front[animation] = {
      src: `/sprites/arkamon/${speciesId}/front/${animation}.webp`,
      frameWidth: cellSize,
      frameHeight: cellSize,
      columns: 10,
      rows: 10,
      frameCount,
      fps: 24,
      width: cellSize,
      height: cellSize,
      durationMs: frameCount / 24 * 1000,
      loop: animation === 'idle',
      viewport,
      ...(animation === 'attack' ? { releaseFrame } : {}),
      ...(animation === 'hit' ? { reactionFrame } : {}),
    }
  }
  return { front }
}

/**
 * Frame grids and padded views match each species' conversion metadata.
 * Action cues are native source-frame indices chosen from the original videos.
 * Other species and the back views retain their existing sprites.
 */
export const ARKAMON_ANIMATION_MANIFEST: Partial<Record<number, ArkamonAnimationSet>> = {
  1: frontAnimationSet(1, 704, { width: 384, height: 384, left: 196, top: 165 }, 45, 30),
  2: frontAnimationSet(2, 576, { width: 384, height: 384, left: 112, top: 81 }, 53, 22),
  3: frontAnimationSet(3, 576, { width: 384, height: 384, left: 112, top: 90 }, 45, 33),
  4: frontAnimationSet(4, 576, { width: 384, height: 384, left: 153, top: 79 }, 47, 25),
  5: frontAnimationSet(5, 640, { width: 384, height: 384, left: 177, top: 140 }, 31, 28),
  6: frontAnimationSet(6, 704, { width: 320, height: 320, left: 208, top: 191 }, 47, 27),
  7: frontAnimationSet(7, 704, { width: 384, height: 384, left: 152, top: 156 }, 51, 26),
  8: frontAnimationSet(8, 768, { width: 384, height: 384, left: 234, top: 186 }, 26, 37),
  9: frontAnimationSet(9, 512, { width: 384, height: 384, left: 66, top: 69 }, 50, 17),
  10: frontAnimationSet(10, 576, { width: 384, height: 384, left: 122, top: 96 }, 58, 27),
  11: frontAnimationSet(11, 768, { width: 384, height: 384, left: 200, top: 179 }, 58, 26),
  12: frontAnimationSet(12, 704, { width: 384, height: 384, left: 193, top: 145 }, 47, 25),
  13: frontAnimationSet(13, 576, { width: 384, height: 384, left: 95, top: 84 }, 48, 32),
  14: frontAnimationSet(14, 640, { width: 384, height: 384, left: 122, top: 112 }, 48, 23, { ko: 95 }),
  15: frontAnimationSet(15, 768, { width: 384, height: 384, left: 180, top: 212 }, 35, 29),
  16: frontAnimationSet(16, 768, { width: 352, height: 352, left: 202, top: 219 }, 46, 18),
  17: frontAnimationSet(17, 768, { width: 320, height: 320, left: 221, top: 240 }, 43, 38, { attack: 95 }),
  18: frontAnimationSet(18, 768, { width: 384, height: 384, left: 203, top: 193 }, 55, 16),
  19: frontAnimationSet(19, 768, { width: 352, height: 352, left: 204, top: 217 }, 36, 13),
  20: frontAnimationSet(20, 704, { width: 384, height: 384, left: 150, top: 153 }, 56, 29),
  21: frontAnimationSet(21, 768, { width: 384, height: 384, left: 200, top: 207 }, 54, 25),
  23: frontAnimationSet(23, 768, { width: 288, height: 288, left: 239, top: 199 }, 50, 30, { idle: 95 }),
  24: frontAnimationSet(24, 704, { width: 320, height: 320, left: 197, top: 213 }, 52, 27),
  25: frontAnimationSet(25, 704, { width: 256, height: 256, left: 224, top: 227 }, 53, 12),
  26: frontAnimationSet(26, 768, { width: 320, height: 320, left: 218, top: 228 }, 32, 14, { victory: 95 }),
  27: frontAnimationSet(27, 768, { width: 256, height: 256, left: 256, top: 256 }, 29, 13),
  28: frontAnimationSet(28, 768, { width: 256, height: 256, left: 256, top: 255 }, 46, 21),
  29: frontAnimationSet(29, 768, { width: 320, height: 320, left: 233, top: 224 }, 45, 14),
  30: frontAnimationSet(30, 768, { width: 192, height: 192, left: 288, top: 288 }, 34, 15, { victory: 95, ko: 95 }),
  31: frontAnimationSet(31, 768, { width: 288, height: 288, left: 264, top: 240 }, 32, 11),
  32: frontAnimationSet(32, 768, { width: 256, height: 256, left: 256, top: 258 }, 30, 25),
  33: frontAnimationSet(33, 768, { width: 320, height: 320, left: 226, top: 227 }, 45, 14),
  34: frontAnimationSet(34, 704, { width: 256, height: 256, left: 223, top: 227 }, 49, 18),
  35: frontAnimationSet(35, 768, { width: 288, height: 288, left: 240, top: 239 }, 31, 7),
  36: frontAnimationSet(36, 768, { width: 256, height: 256, left: 257, top: 230 }, 50, 30),
  37: frontAnimationSet(37, 768, { width: 256, height: 256, left: 256, top: 241 }, 31, 23),
  38: frontAnimationSet(38, 768, { width: 256, height: 256, left: 256, top: 258 }, 45, 18),
  39: frontAnimationSet(39, 768, { width: 176, height: 176, left: 296, top: 296 }, 30, 13),
  40: frontAnimationSet(40, 768, { width: 256, height: 256, left: 256, top: 258 }, 40, 26),
  41: frontAnimationSet(41, 704, { width: 256, height: 256, left: 223, top: 223 }, 23, 13, { idle: 95, attack: 95 }),
  42: frontAnimationSet(42, 704, { width: 192, height: 192, left: 256, top: 253 }, 45, 11),
  43: frontAnimationSet(43, 704, { width: 256, height: 256, left: 274, top: 240 }, 41, 22),
  44: frontAnimationSet(44, 640, { width: 192, height: 192, left: 224, top: 222 }, 42, 17),
  45: frontAnimationSet(45, 704, { width: 256, height: 256, left: 224, top: 232 }, 29, 27),
  46: frontAnimationSet(46, 640, { width: 256, height: 256, left: 192, top: 192 }, 33, 14),
  47: frontAnimationSet(47, 768, { width: 256, height: 256, left: 263, top: 260 }, 36, 14, { hit: 95 }),
  48: frontAnimationSet(48, 704, { width: 256, height: 256, left: 235, top: 225 }, 36, 16),
  49: frontAnimationSet(49, 704, { width: 256, height: 256, left: 243, top: 248 }, 36, 12),
  50: frontAnimationSet(50, 512, { width: 256, height: 256, left: 160, top: 128 }, 30, 29),
  51: frontAnimationSet(51, 640, { width: 256, height: 256, left: 197, top: 195 }, 38, 14),
  52: frontAnimationSet(52, 768, { width: 176, height: 176, left: 291, top: 317 }, 21, 12, { attack: 95, ko: 95 }),
  53: frontAnimationSet(53, 512, { width: 176, height: 176, left: 168, top: 169 }, 44, 16),
  56: frontAnimationSet(56, 640, { width: 192, height: 192, left: 224, top: 225 }, 35, 22),
  57: frontAnimationSet(57, 768, { width: 256, height: 256, left: 256, top: 258 }, 36, 18),
  58: frontAnimationSet(58, 768, { width: 192, height: 192, left: 288, top: 289 }, 31, 13),
  59: frontAnimationSet(59, 640, { width: 192, height: 192, left: 223, top: 225 }, 37, 28),
  60: frontAnimationSet(60, 768, { width: 256, height: 256, left: 256, top: 255 }, 23, 25),
  22: frontAnimationSet(22, 512, { width: 192, height: 192, left: 160, top: 157 }, 51, 26),
  54: frontAnimationSet(54, 448, { width: 192, height: 192, left: 135, top: 127 }, 39, 25),
  55: frontAnimationSet(55, 768, { width: 256, height: 256, left: 256, top: 258 }, 25, 12),
  61: frontAnimationSet(61, 768, { width: 256, height: 256, left: 255, top: 258 }, 30, 16),
  62: frontAnimationSet(62, 640, { width: 192, height: 192, left: 178, top: 232 }, 26, 22),
  63: frontAnimationSet(63, 640, { width: 192, height: 192, left: 225, top: 223 }, 53, 26),
  64: frontAnimationSet(64, 576, { width: 192, height: 192, left: 266, top: 191 }, 22, 25),
  65: frontAnimationSet(65, 704, { width: 192, height: 192, left: 255, top: 256 }, 35, 20),
  66: frontAnimationSet(66, 576, { width: 192, height: 192, left: 192, top: 190 }, 21, 15),
  67: frontAnimationSet(67, 640, { width: 192, height: 192, left: 224, top: 225 }, 50, 25),
  68: frontAnimationSet(68, 576, { width: 192, height: 192, left: 192, top: 189 }, 35, 17),
  69: frontAnimationSet(69, 704, { width: 192, height: 192, left: 332, top: 256 }, 38, 26),
  70: frontAnimationSet(70, 704, { width: 192, height: 192, left: 255, top: 257 }, 50, 14),
  71: frontAnimationSet(71, 704, { width: 192, height: 192, left: 256, top: 246 }, 19, 31),
  72: frontAnimationSet(72, 640, { width: 192, height: 192, left: 224, top: 225 }, 49, 26),
  73: frontAnimationSet(73, 512, { width: 192, height: 192, left: 160, top: 161 }, 32, 13),
  74: frontAnimationSet(74, 768, { width: 192, height: 192, left: 287, top: 290 }, 34, 14),
  75: frontAnimationSet(75, 704, { width: 192, height: 192, left: 256, top: 255 }, 51, 26),
  76: frontAnimationSet(76, 640, { width: 192, height: 192, left: 224, top: 225 }, 39, 22),
  77: frontAnimationSet(77, 576, { width: 192, height: 192, left: 192, top: 195 }, 55, 35),
  78: frontAnimationSet(78, 576, { width: 192, height: 192, left: 192, top: 190 }, 26, 9),
  79: frontAnimationSet(79, 704, { width: 192, height: 192, left: 261, top: 257 }, 45, 14, { victory: 95 }),
  80: frontAnimationSet(80, 576, { width: 192, height: 192, left: 194, top: 192 }, 32, 13),
  81: frontAnimationSet(81, 512, { width: 192, height: 192, left: 159, top: 160 }, 27, 35),
  82: frontAnimationSet(82, 576, { width: 192, height: 192, left: 190, top: 200 }, 33, 11),
  83: frontAnimationSet(83, 576, { width: 192, height: 192, left: 192, top: 178 }, 36, 23, { ko: 95 }),
  84: frontAnimationSet(84, 640, { width: 192, height: 192, left: 224, top: 201 }, 34, 19),
  85: frontAnimationSet(85, 512, { width: 192, height: 192, left: 159, top: 153 }, 35, 26),
  86: frontAnimationSet(86, 704, { width: 192, height: 192, left: 256, top: 253 }, 39, 20),
  87: frontAnimationSet(87, 640, { width: 192, height: 192, left: 224, top: 216 }, 27, 20),
  88: frontAnimationSet(88, 512, { width: 192, height: 192, left: 160, top: 159 }, 24, 14),
  89: frontAnimationSet(89, 704, { width: 192, height: 192, left: 256, top: 243 }, 49, 19),
  90: frontAnimationSet(90, 512, { width: 192, height: 192, left: 160, top: 140 }, 27, 13),
  91: frontAnimationSet(91, 576, { width: 192, height: 192, left: 189, top: 192 }, 27, 23),
  92: frontAnimationSet(92, 640, { width: 192, height: 192, left: 224, top: 202 }, 27, 19),
  93: frontAnimationSet(93, 576, { width: 192, height: 192, left: 194, top: 182 }, 39, 19),
  94: frontAnimationSet(94, 320, { width: 192, height: 192, left: 64, top: 46 }, 43, 13),
  95: frontAnimationSet(95, 576, { width: 192, height: 192, left: 217, top: 175 }, 31, 15),
  96: frontAnimationSet(96, 512, { width: 192, height: 192, left: 160, top: 144 }, 27, 18),
  97: frontAnimationSet(97, 448, { width: 192, height: 192, left: 128, top: 103 }, 43, 16),
  98: frontAnimationSet(98, 512, { width: 192, height: 192, left: 160, top: 153 }, 51, 14),
  99: frontAnimationSet(99, 576, { width: 192, height: 192, left: 191, top: 177 }, 27, 17),
  100: frontAnimationSet(100, 448, { width: 192, height: 192, left: 121, top: 100 }, 46, 9),
  101: frontAnimationSet(101, 512, { width: 192, height: 192, left: 181, top: 156 }, 36, 12),
  102: frontAnimationSet(102, 448, { width: 192, height: 192, left: 128, top: 117 }, 18, 27),
  103: frontAnimationSet(103, 576, { width: 192, height: 192, left: 192, top: 181 }, 40, 12),
  104: frontAnimationSet(104, 576, { width: 192, height: 192, left: 192, top: 192 }, 31, 17),
  105: frontAnimationSet(105, 448, { width: 192, height: 192, left: 128, top: 118 }, 29, 25),
  106: frontAnimationSet(106, 512, { width: 192, height: 192, left: 160, top: 148 }, 33, 39),
  107: frontAnimationSet(107, 384, { width: 192, height: 192, left: 96, top: 98 }, 39, 26, { idle: 95, attack: 95, hit: 95, victory: 95, ko: 95 }),
  108: frontAnimationSet(108, 320, { width: 192, height: 192, left: 82, top: 64 }, 54, 21, { attack: 95, ko: 95 }),
  109: frontAnimationSet(109, 512, { width: 192, height: 192, left: 160, top: 165 }, 32, 21, { hit: 95, victory: 95 }),
  110: frontAnimationSet(110, 576, { width: 192, height: 192, left: 192, top: 192 }, 39, 15, { attack: 95, hit: 95, victory: 95 }),
  111: frontAnimationSet(111, 512, { width: 192, height: 192, left: 160, top: 146 }, 29, 20, { idle: 94, attack: 95, hit: 94, victory: 95, ko: 95 }),
  112: frontAnimationSet(112, 448, { width: 192, height: 192, left: 128, top: 106 }, 55, 27, { idle: 95, attack: 95, hit: 94, victory: 95, ko: 95 }),
  113: frontAnimationSet(113, 384, { width: 192, height: 192, left: 96, top: 75 }, 32, 21, { idle: 94, attack: 95, hit: 95, victory: 94, ko: 95 }),
  114: frontAnimationSet(114, 512, { width: 192, height: 192, left: 160, top: 148 }, 29, 23, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  115: frontAnimationSet(115, 448, { width: 192, height: 192, left: 127, top: 115 }, 47, 14, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  116: frontAnimationSet(116, 384, { width: 192, height: 192, left: 96, top: 81 }, 45, 27, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  117: frontAnimationSet(117, 512, { width: 192, height: 192, left: 154, top: 140 }, 30, 28, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  118: frontAnimationSet(118, 576, { width: 192, height: 192, left: 192, top: 185 }, 51, 31, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  119: frontAnimationSet(119, 512, { width: 192, height: 192, left: 160, top: 157 }, 48, 29, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  120: frontAnimationSet(120, 448, { width: 192, height: 192, left: 128, top: 113 }, 60, 21, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  121: frontAnimationSet(121, 384, { width: 192, height: 192, left: 108, top: 88 }, 34, 26, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  122: frontAnimationSet(122, 448, { width: 192, height: 192, left: 114, top: 129 }, 39, 13, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  123: frontAnimationSet(123, 768, { width: 192, height: 192, left: 298, top: 290 }, 46, 22, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  124: frontAnimationSet(124, 576, { width: 192, height: 192, left: 191, top: 190 }, 45, 15, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  125: frontAnimationSet(125, 640, { width: 192, height: 192, left: 224, top: 219 }, 30, 14, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  126: frontAnimationSet(126, 512, { width: 192, height: 192, left: 160, top: 147 }, 29, 26, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  127: frontAnimationSet(127, 512, { width: 192, height: 192, left: 160, top: 150 }, 50, 15, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  128: frontAnimationSet(128, 640, { width: 192, height: 192, left: 224, top: 224 }, 35, 22, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  129: frontAnimationSet(129, 576, { width: 192, height: 192, left: 192, top: 193 }, 45, 11, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  130: frontAnimationSet(130, 576, { width: 192, height: 192, left: 180, top: 192 }, 47, 18, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  131: frontAnimationSet(131, 576, { width: 192, height: 192, left: 191, top: 189 }, 52, 11, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  132: frontAnimationSet(132, 640, { width: 192, height: 192, left: 224, top: 224 }, 52, 44, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  133: frontAnimationSet(133, 576, { width: 192, height: 192, left: 191, top: 192 }, 29, 31, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  134: frontAnimationSet(134, 576, { width: 192, height: 192, left: 217, top: 180 }, 40, 23, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  135: frontAnimationSet(135, 640, { width: 192, height: 192, left: 225, top: 219 }, 38, 12, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  136: frontAnimationSet(136, 576, { width: 192, height: 192, left: 194, top: 185 }, 57, 12, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  137: frontAnimationSet(137, 512, { width: 192, height: 192, left: 162, top: 159 }, 35, 32, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  138: frontAnimationSet(138, 640, { width: 192, height: 192, left: 224, top: 222 }, 31, 26, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  139: frontAnimationSet(139, 512, { width: 192, height: 192, left: 160, top: 149 }, 36, 22, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  140: frontAnimationSet(140, 576, { width: 192, height: 192, left: 194, top: 191 }, 34, 14, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  141: frontAnimationSet(141, 704, { width: 192, height: 192, left: 256, top: 236 }, 29, 18, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  142: frontAnimationSet(142, 640, { width: 192, height: 192, left: 224, top: 220 }, 26, 6, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  143: frontAnimationSet(143, 704, { width: 192, height: 192, left: 284, top: 255 }, 46, 20, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  144: frontAnimationSet(144, 704, { width: 192, height: 192, left: 254, top: 257 }, 49, 26, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  145: frontAnimationSet(145, 576, { width: 192, height: 192, left: 196, top: 190 }, 42, 44, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  146: frontAnimationSet(146, 704, { width: 192, height: 192, left: 250, top: 252 }, 47, 19, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  147: frontAnimationSet(147, 576, { width: 192, height: 192, left: 192, top: 191 }, 32, 19, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  148: frontAnimationSet(148, 512, { width: 192, height: 192, left: 160, top: 147 }, 43, 24, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  149: frontAnimationSet(149, 832, { width: 192, height: 192, left: 321, top: 321 }, 32, 22, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  150: frontAnimationSet(150, 448, { width: 192, height: 192, left: 128, top: 128 }, 44, 12, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  151: frontAnimationSet(151, 640, { width: 192, height: 192, left: 224, top: 204 }, 38, 13, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  152: frontAnimationSet(152, 512, { width: 192, height: 192, left: 164, top: 157 }, 32, 37, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  153: frontAnimationSet(153, 704, { width: 192, height: 192, left: 255, top: 256 }, 20, 15, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  154: frontAnimationSet(154, 640, { width: 192, height: 192, left: 224, top: 224 }, 28, 10, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  155: frontAnimationSet(155, 576, { width: 192, height: 192, left: 192, top: 191 }, 30, 12, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
  156: frontAnimationSet(156, 768, { width: 192, height: 192, left: 289, top: 288 }, 55, 27, { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 }),
}

export function getArkamonAnimationAsset(
  speciesId: number,
  side: ArkamonSpriteSide,
  animation: ArkamonBattleAnimation
): ArkamonAnimationAsset | undefined {
  return ARKAMON_ANIMATION_MANIFEST[speciesId]?.[side]?.[animation]
}

export interface ResolvedArkamonAnimation {
  asset: ArkamonAnimationAsset
  animation: ArkamonBattleAnimation
  isIdleFallback: boolean
}

/** Runtime pages are derived from the authoritative native atlas, never a second animation spec. */
export function getArkamonRuntimeAsset(asset: ArkamonAnimationAsset): ArkamonAnimationAsset {
  const clip = getNativeRuntimeClip(asset.src)
  return clip && clip.frameWidth === asset.frameWidth && clip.frameHeight === asset.frameHeight
    && clip.frameCount === asset.frameCount && clip.fps === asset.fps
    ? { ...asset, pages: clip.pages } : asset
}

/** A dedicated clip's real runtime; static/procedural views add no battle wait. */
export function getArkamonAnimationDurationMs(
  speciesId: number,
  side: ArkamonSpriteSide,
  animation: ArkamonBattleAnimation
): number {
  const asset = getArkamonAnimationAsset(speciesId, side, animation)
  return asset ? asset.durationMs ?? (asset.frameCount / asset.fps) * 1000 : 0
}

/** Prefer the requested pose, then keep this view's idle instead of changing art. */
export function resolveArkamonAnimationAsset(
  speciesId: number,
  side: ArkamonSpriteSide,
  animation: ArkamonBattleAnimation
): ResolvedArkamonAnimation | undefined {
  const exact = getArkamonAnimationAsset(speciesId, side, animation)
  if (exact) return { asset: getArkamonRuntimeAsset(exact), animation, isIdleFallback: false }

  const idle = getArkamonAnimationAsset(speciesId, side, 'idle')
  return idle ? { asset: getArkamonRuntimeAsset(idle), animation: 'idle', isIdleFallback: true } : undefined
}
