import { create } from 'zustand'
import type { PokemonIstanza } from '@/types'
import type { AdminBattleLayout } from '@/theme/adminThemeTypes'
import type { ArkamonBattleAnimation } from '@/components/arkamon/arkamonAnimationManifest'
import type { DiceRollDisplay } from '@/components/battle/DiceRollOverlay'
import type { MoveVfxEvent } from '@/components/MoveVfx'
import type { UiFit } from '@/ui-studio/types'

export interface PublicBattlePresentation {
  pokemonA: Pick<PokemonIstanza, 'specieId' | 'nome' | 'livello' | 'hp' | 'stato'>
  pokemonB: Pick<PokemonIstanza, 'specieId' | 'nome' | 'livello' | 'hp' | 'stato'>
  hpMaxA: number; hpMaxB: number; background: string; layout: AdminBattleLayout
  animationA: ArkamonBattleAnimation; animationB: ArkamonBattleAnimation
  replayA: number; replayB: number; status: string; messages: string[]
  dice: DiceRollDisplay | null
  effect: MoveVfxEvent | null
  appearance?: {
    enemyFrame?: { source: string; fit: UiFit }
    playerFrame?: { source: string; fit: UiFit }
    background?: string
    hpColors: { hpHigh: string; hpMid: string; hpLow: string }
  }
}
/** Volatile, deliberately contains no phone session or capability token. */
export const usePublicPresentation = create<{ battle: PublicBattlePresentation | null; setBattle: (battle: PublicBattlePresentation | null) => void }>(set => ({
  battle: null, setBattle: battle => set({ battle }),
}))
