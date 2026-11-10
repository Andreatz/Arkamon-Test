import type { BattleChronicle } from '@/types'
import { battleOutcomeSummary } from './battleOutcomeSummary'
import { motion } from 'framer-motion'
import { assetUrl } from '@/utils/assetUrl'
import { useGameMotionPreferences } from '@/settings/gamePreferences'
import './battleRpg.css'

export function BattleResultCard({ chronicle, outcome, gymVictory = false }: { chronicle: BattleChronicle; outcome: string | null; gymVictory?: boolean }) {
  const summary = battleOutcomeSummary(chronicle)
  const { reducedMotion, speed } = useGameMotionPreferences()
  return <section className="battle-result-card" aria-label="Risultato della battaglia" data-battle-result-card>
    {(outcome === 'cattura' || gymVictory) && <motion.img src={assetUrl(`/ui/player-kit/${gymVictory ? 'reward-badge' : 'item-sphere'}.svg`)}
      alt="" aria-hidden="true" className="battle-result-seal" initial={reducedMotion ? false : { scale: .75, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }} transition={{ duration: reducedMotion ? 0 : .45 / speed }} />}
    <h2>{gymVictory ? 'Palestra superata!' : outcome === 'vittoria' ? 'Vittoria!' : outcome === 'sconfitta' ? 'Squadra sconfitta' : outcome === 'cattura' ? 'Arkamon catturato!' : 'Battaglia conclusa'}</h2>
    <p>{summary.partial ? 'Negli ultimi eventi: ' : ''}{summary.enemyKOs} KO avversari · {summary.playerKOs} KO in squadra</p>
    {summary.levels.length > 0 && <ul aria-label="Livelli guadagnati">{summary.levels.map((level, index) => <li key={index}>{level.name} · Lv. {level.before} → {level.after}</li>)}</ul>}
    <p className="battle-result-progress">Gli HP residui sono conservati. Premi Prosegui per continuare.</p>
  </section>
}
