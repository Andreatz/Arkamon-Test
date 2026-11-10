/** Coordinate percentuali sul PNG originale, senza ritagli né deformazioni. */
export interface LocalMapPoint { x: number; y: number }
export interface LocalMapNode extends LocalMapPoint { id: string; label?: string; drawMarker?: boolean }
/** points contiene solo i vertici interni; from e to forniscono gli estremi. */
export interface LocalMapRoad { from: string; to: string; points?: LocalMapPoint[] }
export interface LocalMapDefinition {
  id: string
  image: string
  nodes: LocalMapNode[]
  roads: LocalMapRoad[]
  startNode: string
}
