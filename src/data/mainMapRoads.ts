export const MAIN_MAP_START_NODE = 'Pordenone'

export const MAIN_MAP_ROAD_CONNECTIONS: [string, string][] = [
  ['Pordenone', 'Venezia'],
  ['Venezia', 'Percorso_1'],
  ['Percorso_1', 'Piacenza'],
  ['Percorso_1', 'Percorso_14'],
  ['Piacenza', 'Percorso_2'],
  ['Percorso_2', 'Milano'],
  ['Percorso_2', 'Percorso_4'],
  ['Milano', 'Percorso_3'],
  ['Percorso_4', 'Percorso_5'],
  ['Percorso_5', 'Percorso_6'],
  ['Percorso_5', 'Grosseto'],
  ['Percorso_6', 'Torino'],
  ['Grosseto', 'Civitavecchia'],
  ['Grosseto', 'Percorso_14'],
  ['Civitavecchia', 'Roma'],
  ['Civitavecchia', 'Percorso_7'],
  ['Percorso_7', 'Cagliari'],
  ['Cagliari', 'Percorso_8'],
  ['Percorso_8', 'Palermo'],
  ['Palermo', 'Percorso_9'],
  ['Percorso_9', 'ReggioCalabria'],
  ['ReggioCalabria', 'Percorso_10'],
  ['Percorso_10', 'Foggia'],
  ['Foggia', 'Percorso_11'],
  ['Foggia', 'Percorso_12'],
  ['Percorso_12', 'Napoli'],
  ['Percorso_12', 'Molisnt'],
  ['Molisnt', 'Percorso_13'],
  ['Percorso_13', 'Pescara'],
  ['Pescara', 'Percorso_14'],
  ['Percorso_14', 'Roma'],
]

export function getAdjacentMainMapNodes(nodeName: string): string[] {
  return MAIN_MAP_ROAD_CONNECTIONS.flatMap(([from, to]) => {
    if (from === nodeName) return [to]
    if (to === nodeName) return [from]
    return []
  })
}

export function areMainMapNodesConnected(fromName: string, toName: string): boolean {
  return MAIN_MAP_ROAD_CONNECTIONS.some(
    ([from, to]) =>
      (from === fromName && to === toName) || (from === toName && to === fromName)
  )
}
