/** Face focal point in full-image coordinates; zoom is image width / portrait diameter. */
export interface DepositPortraitFraming {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

// Curated for the current front sprites, separately for every evolution and pose.
export const DEPOSIT_PORTRAIT_FRAMING: Readonly<Record<number, DepositPortraitFraming>> = {
  1: { x: 0.447, y: 0.35, zoom: 2.1 }, // Vyrath
  2: { x: 0.311, y: 0.367, zoom: 2.35 }, // Vyrath
  3: { x: 0.376, y: 0.259, zoom: 4.0 }, // Vyrath
  4: { x: 0.29, y: 0.317, zoom: 3.8 }, // Vyrath
  5: { x: 0.35, y: 0.4, zoom: 1.85 }, // Darklaw
  6: { x: 0.272, y: 0.401, zoom: 2.2 }, // Darklaw
  7: { x: 0.326, y: 0.383, zoom: 2.0 }, // Darklaw
  8: { x: 0.39, y: 0.22, zoom: 3.5 }, // Darklaw
  9: { x: 0.427, y: 0.485, zoom: 1.5 }, // Felyss
  10: { x: 0.325, y: 0.343, zoom: 1.75 }, // Felyss
  11: { x: 0.38, y: 0.28, zoom: 2.6 }, // Felyss
  12: { x: 0.303, y: 0.237, zoom: 2.6 }, // Felyss
  13: { x: 0.293, y: 0.397, zoom: 1.95 }, // Wormaren
  14: { x: 0.322, y: 0.315, zoom: 2.4 }, // Wormaren
  15: { x: 0.345, y: 0.3, zoom: 1.75 }, // Wormaren
  16: { x: 0.425, y: 0.417, zoom: 1.65 }, // Clastoom
  17: { x: 0.355, y: 0.41, zoom: 1.75 }, // Clastoom
  18: { x: 0.307, y: 0.418, zoom: 2.3 }, // Clastoom
  19: { x: 0.375, y: 0.344, zoom: 2.5 }, // Colussand
  20: { x: 0.444, y: 0.376, zoom: 2.2 }, // Handipus
  21: { x: 0.3, y: 0.405, zoom: 2.6 }, // Shrody
  22: { x: 0.375, y: 0.342, zoom: 3.3 }, // Voltrake
  23: { x: 0.415, y: 0.34, zoom: 1.9 }, // Sparkly
  24: { x: 0.304, y: 0.4, zoom: 2.1 }, // Grimbolt
  25: { x: 0.264, y: 0.417, zoom: 2.1 }, // Grimbolt
  26: { x: 0.268, y: 0.412, zoom: 2.4 }, // Ampereel
  27: { x: 0.416, y: 0.37, zoom: 2.25 }, // Ampereel
  28: { x: 0.33, y: 0.397, zoom: 1.75 }, // Silvard
  29: { x: 0.225, y: 0.303, zoom: 2.5 }, // Silvard
  30: { x: 0.375, y: 0.346, zoom: 1.9 }, // Eclyps
  31: { x: 0.27, y: 0.325, zoom: 2.9 }, // Eclyps
  32: { x: 0.33, y: 0.415, zoom: 1.7 }, // Blazion
  33: { x: 0.25, y: 0.333, zoom: 2.7 }, // Blazion
  34: { x: 0.25, y: 0.419, zoom: 3.0 }, // Crawgoyle
  35: { x: 0.241, y: 0.363, zoom: 2.2 }, // Crawgoyle
  36: { x: 0.307, y: 0.417, zoom: 1.8 }, // Chimzap
  37: { x: 0.442, y: 0.353, zoom: 1.9 }, // Chimzap
  38: { x: 0.44, y: 0.36, zoom: 1.85 }, // Chimzap
  39: { x: 0.464, y: 0.407, zoom: 1.6 }, // RS-219
  40: { x: 0.405, y: 0.324, zoom: 2.25 }, // RS-219
  41: { x: 0.409, y: 0.382, zoom: 2.15 }, // RS-219
  42: { x: 0.363, y: 0.508, zoom: 1.65 }, // Felvex
  43: { x: 0.319, y: 0.431, zoom: 1.85 }, // Felvex
  44: { x: 0.323, y: 0.452, zoom: 1.8 }, // Felvex
  45: { x: 0.44, y: 0.415, zoom: 1.85 }, // Spectron
  46: { x: 0.476, y: 0.435, zoom: 2.0 }, // Spectron
  47: { x: 0.339, y: 0.47, zoom: 1.9 }, // Weedrug
  48: { x: 0.391, y: 0.466, zoom: 1.85 }, // Weedrug
  49: { x: 0.25, y: 0.29, zoom: 2.25 }, // Constrix
  50: { x: 0.254, y: 0.335, zoom: 1.95 }, // Constrix
  51: { x: 0.282, y: 0.258, zoom: 2.25 }, // Goliash
  52: { x: 0.379, y: 0.427, zoom: 1.5 }, // Leafrex
  53: { x: 0.27, y: 0.319, zoom: 2.1 }, // Leafrex
  54: { x: 0.326, y: 0.32, zoom: 2.3 }, // Leafrex
  55: { x: 0.383, y: 0.258, zoom: 2.2 }, // Peek-a-buu
  56: { x: 0.423, y: 0.395, zoom: 1.8 }, // Deephion
  57: { x: 0.407, y: 0.339, zoom: 1.7 }, // Deephion
  58: { x: 0.3, y: 0.488, zoom: 1.6 }, // Shabyss
  59: { x: 0.3, y: 0.45, zoom: 1.85 }, // Shabyss
  60: { x: 0.26, y: 0.375, zoom: 1.7 }, // Shabyss
  61: { x: 0.198, y: 0.32, zoom: 1.75 }, // Wailoom
  62: { x: 0.395, y: 0.427, zoom: 1.65 }, // Fluffet
  63: { x: 0.351, y: 0.423, zoom: 1.65 }, // Fluffet
  64: { x: 0.423, y: 0.363, zoom: 1.65 }, // Hopz
  65: { x: 0.657, y: 0.238, zoom: 2.2 }, // Piox
  66: { x: 0.37, y: 0.34, zoom: 1.4 }, // Hoppiox
  67: { x: 0.472, y: 0.323, zoom: 1.7 }, // Fearstraw
  68: { x: 0.464, y: 0.282, zoom: 1.85 }, // Fearstraw
  69: { x: 0.314, y: 0.285, zoom: 1.95 }, // Lickard
  70: { x: 0.47, y: 0.145, zoom: 2.1 }, // Lickard
  71: { x: 0.415, y: 0.496, zoom: 1.75 }, // Blizzaquil
  72: { x: 0.371, y: 0.423, zoom: 1.7 }, // Blizzaquil
  73: { x: 0.36, y: 0.375, zoom: 2.55 }, // Blizzaquil
  74: { x: 0.379, y: 0.532, zoom: 1.8 }, // Impise
  75: { x: 0.422, y: 0.4, zoom: 2.1 }, // Impise
  76: { x: 0.386, y: 0.321, zoom: 2.45 }, // Impise
  77: { x: 0.448, y: 0.441, zoom: 2.1 }, // Ignitor
  78: { x: 0.438, y: 0.39, zoom: 2.3 }, // Trippix
  79: { x: 0.345, y: 0.395, zoom: 1.9 }, // Cellgon
  80: { x: 0.362, y: 0.353, zoom: 2.3 }, // Cellgon
  81: { x: 0.448, y: 0.355, zoom: 2.4 }, // Cellgon
  82: { x: 0.328, y: 0.663, zoom: 2.3 }, // Reliskull
  83: { x: 0.368, y: 0.414, zoom: 1.8 }, // Cerebron
  84: { x: 0.469, y: 0.29, zoom: 1.9 }, // Psycroak
  85: { x: 0.459, y: 0.253, zoom: 2.6 }, // Psycroak
  86: { x: 0.455, y: 0.4, zoom: 1.8 }, // Teslat
  87: { x: 0.369, y: 0.39, zoom: 1.75 }, // Teslat
  88: { x: 0.364, y: 0.272, zoom: 1.8 }, // Teslat
  89: { x: 0.431, y: 0.424, zoom: 1.65 }, // Espeiry
  90: { x: 0.438, y: 0.3, zoom: 1.9 }, // Espeiry
  91: { x: 0.452, y: 0.221, zoom: 1.6 }, // Espeiry
  92: { x: 0.362, y: 0.334, zoom: 1.75 }, // Pyrodil
  93: { x: 0.303, y: 0.324, zoom: 1.8 }, // Pyrodil
  94: { x: 0.255, y: 0.241, zoom: 2.2 }, // Pyrodil
  95: { x: 0.328, y: 0.5, zoom: 1.8 }, // Beestrix
  96: { x: 0.376, y: 0.441, zoom: 2.1 }, // Beestrix
  97: { x: 0.482, y: 0.373, zoom: 2.0 }, // Beestrix
  98: { x: 0.455, y: 0.376, zoom: 2.05 }, // Grooty
  99: { x: 0.352, y: 0.417, zoom: 1.85 }, // Ervys
  100: { x: 0.257, y: 0.697, zoom: 2.3 }, // Ervys
  101: { x: 0.364, y: 0.459, zoom: 1.65 }, // Xesar
  102: { x: 0.376, y: 0.321, zoom: 2.0 }, // Xesar
  103: { x: 0.41, y: 0.338, zoom: 1.85 }, // Boomrock
  104: { x: 0.371, y: 0.31, zoom: 1.8 }, // Boomrock
  105: { x: 0.348, y: 0.5, zoom: 2.15 }, // Zoorian
  106: { x: 0.434, y: 0.441, zoom: 2.25 }, // Zoorian
  107: { x: 0.285, y: 0.29, zoom: 2.6 }, // Ao-shin
  108: { x: 0.285, y: 0.29, zoom: 2.6 }, // Aka-shin
  109: { x: 0.5, y: 0.386, zoom: 1.7 }, // Oniros
  110: { x: 0.39, y: 0.31, zoom: 2.0 }, // Voider
}

const DEFAULT_FRAMING: DepositPortraitFraming = { x: 0.5, y: 0.5, zoom: 1 }

export function getDepositPortraitFraming(speciesId: number): DepositPortraitFraming {
  return DEPOSIT_PORTRAIT_FRAMING[speciesId] ?? DEFAULT_FRAMING
}
