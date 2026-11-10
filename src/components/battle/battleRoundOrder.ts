import type { Lato, StatoAlterato } from '@/types'

/** Each side acts once per round. Paralysis changes only the following round's priority. */
export function nextBattleSide(acted: Set<Lato>, side: Lato, initial: Lato, statusA?: StatoAlterato, statusB?: StatoAlterato): Lato {
  acted.add(side)
  if (acted.size < 2) return side === 'A' ? 'B' : 'A'
  acted.clear()
  const a = statusA === 'Paralizzato', b = statusB === 'Paralizzato'
  return a !== b ? (a ? 'B' : 'A') : initial
}
