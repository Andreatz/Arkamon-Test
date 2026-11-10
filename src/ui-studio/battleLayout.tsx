import { createContext, useContext, type ReactNode } from 'react'
import { useAdminStore } from '@/store/adminStore'
import type { AdminBattleLayout, AdminBattleLayoutKey } from '@/theme/adminThemeTypes'
import { resolvedScreenDesign } from './runtimeDesign'
import type { UiDesignDocument } from './types'

/** Stable component identities shared by the editor, renderer and effect anchors. */
export const BATTLE_LAYOUT_IDS: Record<AdminBattleLayoutKey, string> = {
  enemySprite: 'layout.sprite-nemico', playerSprite: 'layout.sprite-giocatore',
  enemyHp: 'layout.hp-nemico', playerHp: 'layout.hp-giocatore',
  enemySquad: 'layout.squadra-nemica', playerSquad: 'layout.squadra-giocatore',
  infoBox: 'layout.box-messaggi', playerMoves: 'layout.mosse-giocatore',
  enemyMoves: 'layout.mosse-rivale', playerSupreme: 'layout.suprema-giocatore',
  enemySupreme: 'layout.suprema-rivale', turnStatus: 'layout.stato-turno',
  passTurnButton: 'layout.passa-controllo', resultMoney: 'layout.ricompensa',
  continueButton: 'layout.prosegui',
}

/** Pure: named views inherit the base design, while legacy text offsets survive. */
export function resolveBattleLayout(
  legacy: AdminBattleLayout,
  design?: UiDesignDocument,
  screen = 'battaglia',
): AdminBattleLayout {
  const elements = design?.screens ? resolvedScreenDesign(design, screen)?.elements : undefined
  if (!elements) return legacy
  let resolved = legacy
  for (const key of Object.keys(BATTLE_LAYOUT_IDS) as AdminBattleLayoutKey[]) {
    const rect = elements[BATTLE_LAYOUT_IDS[key]]?.rect
    if (!rect) continue
    if (resolved === legacy) resolved = { ...legacy }
    resolved[key] = { ...legacy[key], ...rect }
  }
  return resolved
}

/** The isolated editor supplies its draft; the real game uses the applied design. */
export const UiDesignPreviewContext = createContext<{ design: UiDesignDocument; screen: string } | null>(null)
const BattleLayoutContext = createContext<AdminBattleLayout | null>(null)

export function BattleLayoutProvider({ value, children }: { value: AdminBattleLayout; children: ReactNode }) {
  return <BattleLayoutContext.Provider value={value}>{children}</BattleLayoutContext.Provider>
}

export function useResolvedBattleLayout(view?: string | null): AdminBattleLayout {
  const inherited = useContext(BattleLayoutContext)
  const preview = useContext(UiDesignPreviewContext)
  const legacy = useAdminStore(state => state.theme.layouts.battle)
  const applied = useAdminStore(state => state.theme.design)
  const screen = preview?.screen ?? (view && view !== 'default' ? `battaglia:${view}` : 'battaglia')
  return inherited ?? resolveBattleLayout(legacy, preview?.design ?? applied, screen)
}
