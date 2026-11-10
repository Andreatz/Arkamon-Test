/** Imported paintings awaiting an authored, reviewed node/road definition.
 * A picture is not a movement graph: registering it as playable would invent
 * connections and invalidate existing location progress. Keep it available as
 * source artwork without silently enabling a new route topology.
 */
export const PENDING_LOCAL_MAP_ARTWORK = [
  { id: 'Percorso_5', image: '/maps/Percorso_5.png' },
  { id: 'Percorso_6', image: '/maps/Percorso_6.png' },
  { id: 'Percorso_7', image: '/maps/Percorso_7.png' },
  { id: 'Percorso_8', image: '/maps/Percorso_8.png' },
  { id: 'Percorso_12', image: '/maps/Percorso_12.png' },
] as const
