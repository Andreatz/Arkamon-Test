import { resolveWorldMapHudLayout } from '@/components/map/worldMapHudLayout'
import { RpgWindow } from '@/components/rpg'
import './worldMapRpg.css'
import { GameButton } from '@/components/ui/GameButton'
import { useGameStore } from '@store/gameStore'
import { TurnSummary } from '@/journal/TurnSummary'
import { useAdminStore } from '@store/adminStore'
import { MAPPE } from '@data/index'
import { getLocalMap } from '@/data/localMaps'
import { SECRET_LOCATION_ID, canAccessSecretLocation, hasUnlockedSecretLocation, isSecretLocationPosition } from '@/data/secretLocation'
import {
  MAIN_MAP_START_NODE,
  MAIN_MAP_ROAD_CONNECTIONS,
  getAdjacentMainMapNodes,
} from '@data/mainMapRoads'
import { motion } from 'framer-motion'
import { assetUrl } from '@/utils/assetUrl'
import {
  hasOnlyOrthogonalSegments,
  orthogonalizeRoadPoints,
} from '@/utils/mainMapRoadGeometry'
import { AdminLayoutItem } from '@/admin/AdminLayoutItem'
import { trackAdminPointerDrag } from '@/admin/adminPointerDrag'
import { MainMapAvatar } from '@/components/map/MainMapAvatar'
import { getMainMapJourney } from '@/components/map/mapJourney'
import { useEffect, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type {
  AdminLayoutRect,
  AdminMainMapUiLayoutKey,
  AdminMapRoadPoint,
} from '@/theme/adminThemeTypes'

/**
 * Mappa principale: 28 luoghi disposti sopra un'Italia stilizzata.
 * I percorsi (Percorso_N) portano alla scena Percorso, le città/isole
 * portano alla scena Citta (placeholder finché non implementata).
 *
 * Coordinate: x/y in percentuale (0-100). Sono qui inline per facilità
 * di tuning visivo: una volta consolidate, possono essere promosse in
 * mappe.json.
 */
type Tipo = 'citta' | 'percorso' | 'villaggio'

const COORDS: Record<string, { x: number; y: number; tipo: Tipo }> = {
  // Nord
  Torino:         { x: 22, y: 26, tipo: 'citta' },
  Percorso_6:     { x: 24, y: 28, tipo: 'percorso' },
  Percorso_5:     { x: 22, y: 32, tipo: 'percorso' },
  Percorso_4:     { x: 26, y: 30, tipo: 'percorso' },
  Percorso_3:     { x: 28, y: 24, tipo: 'percorso' },
  Milano:         { x: 32, y: 22, tipo: 'citta' },
  Percorso_2:     { x: 36, y: 24, tipo: 'percorso' },
  Piacenza:       { x: 40, y: 28, tipo: 'villaggio' },
  Percorso_1:     { x: 48, y: 26, tipo: 'percorso' },
  Venezia:        { x: 56, y: 24, tipo: 'citta' },
  Pordenone:      { x: 64, y: 20, tipo: 'percorso' },

  // Centro
  Grosseto:       { x: 38, y: 44, tipo: 'citta' },
  Civitavecchia:  { x: 42, y: 52, tipo: 'villaggio' },
  Roma:           { x: 48, y: 56, tipo: 'citta' },
  Percorso_14:    { x: 54, y: 54, tipo: 'percorso' },
  Pescara:        { x: 60, y: 52, tipo: 'citta' },
  Percorso_13:    { x: 60, y: 56, tipo: 'percorso' },
  Molisnt:        { x: 62, y: 60, tipo: 'villaggio' },
  Napoli:         { x: 56, y: 64, tipo: 'citta' },
  Percorso_12:    { x: 62, y: 64, tipo: 'percorso' },
  Percorso_11:    { x: 66, y: 62, tipo: 'percorso' },
  Foggia:         { x: 72, y: 62, tipo: 'citta' },

  // Sud
  Percorso_10:    { x: 64, y: 72, tipo: 'percorso' },
  ReggioCalabria: { x: 58, y: 82, tipo: 'villaggio' },
  Percorso_9:     { x: 52, y: 88, tipo: 'percorso' },
  Palermo:        { x: 44, y: 90, tipo: 'citta' },

  // Sardegna
  Percorso_7:     { x: 32, y: 64, tipo: 'percorso' },
  Cagliari:       { x: 24, y: 78, tipo: 'citta' },
  Percorso_8:     { x: 32, y: 86, tipo: 'percorso' },
}

const ROAD_SNAP_DISTANCE = 1.35

function clampNodePosition(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function getRoadKey(fromName: string, toName: string): string {
  return `${fromName}__${toName}`
}

function defaultRoadPoints(
  from: AdminMapRoadPoint,
  to: AdminMapRoadPoint
): AdminMapRoadPoint[] {
  return [
    { x: from.x, y: from.y },
    { x: to.x, y: to.y },
  ]
}

function anchoredRoadPoints(
  from: AdminMapRoadPoint,
  to: AdminMapRoadPoint,
  savedPoints: AdminMapRoadPoint[] | undefined
): AdminMapRoadPoint[] {
  if (!savedPoints || savedPoints.length < 2) {
    return defaultRoadPoints(from, to)
  }

  return [
    { x: from.x, y: from.y },
    ...savedPoints.slice(1, -1).map((point) => ({ ...point })),
    { x: to.x, y: to.y },
  ]
}

function roadPath(points: AdminMapRoadPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
}

function editableRoadControlPoints(points: AdminMapRoadPoint[]): AdminMapRoadPoint[] {
  if (points.length <= 3 || !hasOnlyOrthogonalSegments(points)) {
    return points.map((point) => ({ ...point }))
  }

  const controls = points.filter((_, index) => (
    index === 0 || index === points.length - 1 || index % 2 === 0
  ))

  return controls.map((point) => ({ ...point }))
}

function getMapPoint(
  bounds: DOMRect,
  clientX: number,
  clientY: number
): AdminMapRoadPoint {
  return {
    x: clampNodePosition(((clientX - bounds.left) / bounds.width) * 100),
    y: clampNodePosition(((clientY - bounds.top) / bounds.height) * 100),
  }
}

function distanceToSegment(
  point: AdminMapRoadPoint,
  start: AdminMapRoadPoint,
  end: AdminMapRoadPoint
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  )
  const projectionX = start.x + t * dx
  const projectionY = start.y + t * dy
  return Math.hypot(point.x - projectionX, point.y - projectionY)
}

function closestPointOnSegment(
  point: AdminMapRoadPoint,
  start: AdminMapRoadPoint,
  end: AdminMapRoadPoint
): { point: AdminMapRoadPoint; distance: number } {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return {
      point: { x: start.x, y: start.y },
      distance: Math.hypot(point.x - start.x, point.y - start.y),
    }
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  )
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  }

  return {
    point: projection,
    distance: Math.hypot(point.x - projection.x, point.y - projection.y),
  }
}

function nearestSegmentIndex(points: AdminMapRoadPoint[], point: AdminMapRoadPoint): number {
  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(point, points[index], points[index + 1])
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  }

  return nearestIndex
}

function getMainMapNodeName(position: { mappaId: string; luogo?: string }): string {
  return position.mappaId === 'mappa-principale'
    ? position.luogo ?? MAIN_MAP_START_NODE
    : MAIN_MAP_START_NODE
}

function isRouteNode(tipo: Tipo): boolean {
  return tipo === 'percorso'
}

function getMapNodeIcon(nome: string, tipo: Tipo): string {
  if (nome === MAIN_MAP_START_NODE) return '/ui/start_location.png'
  if (tipo === 'villaggio') return '/ui/countries.png'
  return tipo === 'percorso' ? '/ui/route.png' : '/ui/cities.png'
}

function getMapNodeIconSize(nome: string, tipo: Tipo): number {
  if (nome === MAIN_MAP_START_NODE) return 22.4
  return tipo === 'percorso' ? 16 : 22.4
}

export function MappaPrincipaleScene() {
  const [hoverDestination, setPreviewDestination] = useState<string | null>(null)
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null)
  const previewDestination = selectedDestination ?? hoverDestination
  const vaiAScena = useGameStore((s) => s.vaiAScena)
  const turnoOverworld = useGameStore((s) => s.turnoOverworld)
  const posizione1 = useGameStore((s) => s.posizione1)
  const posizione2 = useGameStore((s) => s.posizione2)
  const passaTurnoOverworld = useGameStore((s) => s.passaTurnoOverworld)
  const muoviAvatarMappaPrincipale = useGameStore((s) => s.muoviAvatarMappaPrincipale)
  const attraversaPassaggioSegreto = useGameStore((s) => s.attraversaPassaggioSegreto)
  const interagisciLuogoMappaPrincipale = useGameStore(
    (s) => s.interagisciLuogoMappaPrincipale
  )
  const giocatore = useGameStore((s) =>
    turnoOverworld.giocatoreAttivo === 1 ? s.giocatore1 : s.giocatore2
  )
  const layoutEditing = useAdminStore((s) => s.layoutEditing)
  const nodePositions = useAdminStore((s) => s.theme.layouts.mainMapNodes)
  const roadLayouts = useAdminStore((s) => s.theme.layouts.mainMapRoads)
  const legacyMainMapUiLayout = useAdminStore((s) => s.theme.layouts.mainMapUi)
  const { layout: mainMapUiLayout, combined: combinedHud } = resolveWorldMapHudLayout(legacyMainMapUiLayout)
  const roadOpacity = useAdminStore((s) => s.theme.ui.mainMapRoadOpacity)
  const beginLayoutChange = useAdminStore((s) => s.beginLayoutChange)
  const updateMainMapNodePosition = useAdminStore((s) => s.updateMainMapNodePosition)
  const updateMainMapRoad = useAdminStore((s) => s.updateMainMapRoad)
  const updateSceneLayout = useAdminStore((s) => s.updateSceneLayout)

  const giocatoreAttivo = turnoOverworld.giocatoreAttivo
  const activeNodeName = getMainMapNodeName(giocatoreAttivo === 1 ? posizione1 : posizione2)
  const activePosition = giocatoreAttivo === 1 ? posizione1 : posizione2
  const player1NodeName = getMainMapNodeName(posizione1)
  const player2NodeName = getMainMapNodeName(posizione2)
  const reachableNodeNames = getAdjacentMainMapNodes(activeNodeName)
  const movimentoDisponibile = turnoOverworld.azioniRimaste > 0
  const interazioneDisponibile = turnoOverworld.azioniRimaste > 0
  const aperturaDisponibile = !!getLocalMap(activeNodeName) || interazioneDisponibile
  const updateMainMapUiLayout = (
    key: AdminMainMapUiLayoutKey,
    rect: AdminLayoutRect
  ) => updateSceneLayout({ scene: 'mainMapUi', key, rect })

  useEffect(() => { setSelectedDestination(null); setPreviewDestination(null) }, [activeNodeName, giocatoreAttivo])
  const interactWithCurrentNode = () => {
    if (layoutEditing) return
    if (activeNodeName === MAIN_MAP_START_NODE && !getLocalMap(activeNodeName)) {
      setSelectedDestination(reachableNodeNames[0] ?? null)
      return
    }
    if (getLocalMap(activeNodeName)) {
      useGameStore.getState().eseguiTransazione(() => {
        if (useGameStore.getState().apriMappaLocale(giocatoreAttivo, activeNodeName)) {
          vaiAScena(isRouteNode(COORDS[activeNodeName].tipo) ? 'percorso' : 'citta', { luogo: activeNodeName })
        }
      })
      return
    }
    useGameStore.getState().eseguiTransazione(() => {
      const result = interagisciLuogoMappaPrincipale(giocatoreAttivo)
      if (result.tipo === 'no-op') return
      const coord = COORDS[result.luogo]
      if (!coord) return
      vaiAScena(isRouteNode(coord.tipo) ? 'percorso' : 'citta', { luogo: result.luogo })
    })
  }

  const apriDeposito = () => {
    useGameStore.getState().eseguiTransazione(() => {
      useGameStore.getState().aggiornaStato({ giocatoreAttivo })
      vaiAScena('deposito')
    })
  }

  const click = (nome: string, tipo: Tipo) => {
    if (layoutEditing) return
    if (nome === activeNodeName) {
      interactWithCurrentNode()
      return
    }

    if (movimentoDisponibile && reachableNodeNames.includes(nome)) {
      setSelectedDestination(nome)
    }

    void tipo
  }

  const startNodeDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    nome: string
  ) => {
    if (!layoutEditing) return

    const root = event.currentTarget.closest('[data-main-map-root]') as HTMLElement | null
    if (!root) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    beginLayoutChange()

    const bounds = root.getBoundingClientRect()
    const currentPosition = nodePositions[nome] ?? COORDS[nome]
    const pointerOffset = {
      x: bounds.left + (currentPosition.x / 100) * bounds.width - event.clientX,
      y: bounds.top + (currentPosition.y / 100) * bounds.height - event.clientY,
    }

    const moveTo = (clientX: number, clientY: number) => {
      updateMainMapNodePosition(
        nome,
        getMapPoint(
          bounds,
          clientX + pointerOffset.x,
          clientY + pointerOffset.y
        )
      )
    }

    moveTo(event.clientX, event.clientY)
    trackAdminPointerDrag(event.pointerId, (moveEvent) => moveTo(moveEvent.clientX, moveEvent.clientY))
  }

  const getRoadPointWithSnap = (
    point: AdminMapRoadPoint,
    currentRoadKey: string,
    currentPointIndex: number | null
  ): AdminMapRoadPoint => {
    const nodeCandidates: AdminMapRoadPoint[] = Object.keys(COORDS).map((name) => {
      const position = nodePositions[name] ?? COORDS[name]
      return { x: position.x, y: position.y }
    })

    let nearest = nodeCandidates.reduce<{
      point: AdminMapRoadPoint | null
      distance: number
    }>(
      (best, candidate) => {
        const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y)
        return distance < best.distance ? { point: candidate, distance } : best
      },
      { point: null, distance: Number.POSITIVE_INFINITY }
    )

    for (const [fromName, toName] of MAIN_MAP_ROAD_CONNECTIONS) {
      const key = getRoadKey(fromName, toName)
      if (key === currentRoadKey) continue

      const from = nodePositions[fromName] ?? COORDS[fromName]
      const to = nodePositions[toName] ?? COORDS[toName]
      if (!from || !to) continue

      const roadPoints = orthogonalizeRoadPoints(
        editableRoadControlPoints(anchoredRoadPoints(from, to, roadLayouts[key]))
      )
      for (let index = 0; index < roadPoints.length - 1; index += 1) {
        if (currentPointIndex !== null && key === currentRoadKey) continue
        const candidate = closestPointOnSegment(point, roadPoints[index], roadPoints[index + 1])
        if (candidate.distance < nearest.distance) {
          nearest = candidate
        }
      }
    }

    return nearest.point && nearest.distance <= ROAD_SNAP_DISTANCE
      ? nearest.point
      : point
  }

  const startRoadPointDrag = (
    event: ReactPointerEvent<SVGCircleElement>,
    roadKey: string,
    points: AdminMapRoadPoint[],
    pointIndex: number
  ) => {
    if (!layoutEditing || pointIndex === 0 || pointIndex === points.length - 1) return

    const root = event.currentTarget.closest('[data-main-map-root]') as HTMLElement | null
    if (!root) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    beginLayoutChange()

    const bounds = root.getBoundingClientRect()

    const moveTo = (clientX: number, clientY: number) => {
      const nextPoints = points.map((point) => ({ ...point }))
      nextPoints[pointIndex] = getRoadPointWithSnap(
        getMapPoint(bounds, clientX, clientY),
        roadKey,
        pointIndex
      )
      updateMainMapRoad(roadKey, nextPoints)
    }

    moveTo(event.clientX, event.clientY)
    trackAdminPointerDrag(event.pointerId, (moveEvent) => moveTo(moveEvent.clientX, moveEvent.clientY))
  }

  const addRoadPoint = (
    event: ReactMouseEvent<SVGPathElement>,
    roadKey: string,
    points: AdminMapRoadPoint[]
  ) => {
    if (!layoutEditing) return

    const root = event.currentTarget.closest('[data-main-map-root]') as HTMLElement | null
    if (!root) return

    event.preventDefault()
    event.stopPropagation()

    beginLayoutChange()
    const point = getRoadPointWithSnap(
      getMapPoint(root.getBoundingClientRect(), event.clientX, event.clientY),
      roadKey,
      null
    )
    const insertIndex = nearestSegmentIndex(points, point) + 1
    updateMainMapRoad(roadKey, [
      ...points.slice(0, insertIndex),
      point,
      ...points.slice(insertIndex),
    ])
  }

  const removeRoadPoint = (
    event: ReactMouseEvent<SVGCircleElement>,
    roadKey: string,
    points: AdminMapRoadPoint[],
    pointIndex: number
  ) => {
    if (!layoutEditing || pointIndex === 0 || pointIndex === points.length - 1) return

    event.preventDefault()
    event.stopPropagation()

    beginLayoutChange()
    updateMainMapRoad(roadKey, points.filter((_, index) => index !== pointIndex))
  }

  const roadRenderItems = MAIN_MAP_ROAD_CONNECTIONS.flatMap(([fromName, toName]) => {
    const from = nodePositions[fromName] ?? COORDS[fromName]
    const to = nodePositions[toName] ?? COORDS[toName]
    if (!from || !to) return []

    const key = getRoadKey(fromName, toName)
    const controlPoints = editableRoadControlPoints(
      anchoredRoadPoints(from, to, roadLayouts[key])
    )
    const points = orthogonalizeRoadPoints(controlPoints)

    return [{ key, points, controlPoints, d: roadPath(points) }]
  })

  if (isSecretLocationPosition(activePosition)) return <section className="local-map-scene" aria-label="Passaggio di ritorno">
    <header className="local-map-toolbar">
      <div className="local-map-heading"><h1>{canAccessSecretLocation(giocatore, activePosition) ? 'Percorso 15' : 'Luogo non disponibile'}</h1><span>G{giocatoreAttivo} · {giocatore.nome}</span></div>
      <span className="local-map-budget" role="status">{turnoOverworld.azioniRimaste} azioni</span>
      {canAccessSecretLocation(giocatore, activePosition) && <>
        <GameButton onClick={() => {
          useGameStore.getState().eseguiTransazione(() => {
            if (useGameStore.getState().apriMappaLocale(giocatoreAttivo, SECRET_LOCATION_ID)) vaiAScena('percorso', { luogo: SECRET_LOCATION_ID })
          })
        }}>Riapri Percorso 15</GameButton>
        <GameButton tone="primary" disabled={!movimentoDisponibile} onClick={() => attraversaPassaggioSegreto(giocatoreAttivo)}>Torna a Roma · 1 movimento</GameButton>
      </>}
      <GameButton onClick={passaTurnoOverworld}>Passa turno</GameButton>
    </header>
    <p>Il passaggio conduce a Roma. Tornare alla città consuma un movimento.</p>
  </section>

  return (
    <div
      data-main-map-root
      data-world-rpg-map
      data-combined-hud={combinedHud}
      className="relative w-full h-full bg-cover bg-center overflow-hidden"
      style={{ backgroundImage: `url(${assetUrl('/maps/Mappa-Finale.jpg')})` }}
    >
      <div className="absolute inset-0 bg-black/20" />
      {combinedHud && <RpgWindow className="world-map-unified-hud" aria-hidden="true" />}

      <svg
        className={`absolute inset-0 z-10 h-full w-full ${
          layoutEditing ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <mask
            id="main-map-road-border-mask"
            x="-10"
            y="-10"
            width="120"
            height="120"
            maskUnits="userSpaceOnUse"
          >
            <rect x="-10" y="-10" width="120" height="120" fill="white" />
            {roadRenderItems.map(({ key, d }) => (
              <path
                key={`${key}-mask`}
                d={d}
                fill="none"
                stroke="black"
                strokeWidth="10"
                strokeLinecap="square"
                strokeLinejoin="miter"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </mask>
        </defs>

        {roadRenderItems.map(({ key, d }) => (
          <path
            key={`${key}-border`}
            d={d}
            fill="none"
            stroke="rgba(0,0,0,0.92)"
            strokeWidth="14"
            strokeLinecap="butt"
            strokeLinejoin="miter"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
            mask="url(#main-map-road-border-mask)"
          />
        ))}

        {roadRenderItems.map(({ key, d }) => (
          <path
            key={`${key}-fill`}
            d={d}
            fill="none"
            stroke="#e5e5e5"
            strokeOpacity={roadOpacity}
            strokeWidth="10"
            strokeLinecap="butt"
            strokeLinejoin="miter"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}

        {roadRenderItems.map(({ key, controlPoints, d }) => (
          <g key={`${key}-editor`}>
              {layoutEditing ? (
                <>
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="18"
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="stroke"
                    onDoubleClick={(event) => addRoadPoint(event, key, controlPoints)}
                  />
                  {controlPoints.map((point, index) => {
                    const isAnchor = index === 0 || index === controlPoints.length - 1

                    return (
                      <circle
                        key={`${key}-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r={isAnchor ? '0.42' : '0.7'}
                        fill={isAnchor ? 'rgba(255,255,255,0.55)' : '#38bdf8'}
                        stroke="#ffffff"
                        strokeWidth="0.22"
                        vectorEffect="non-scaling-stroke"
                        className={isAnchor ? 'drop-shadow' : 'cursor-move drop-shadow'}
                        pointerEvents={isAnchor ? 'none' : 'all'}
                        onPointerDown={(event) => startRoadPointDrag(event, key, controlPoints, index)}
                        onDoubleClick={(event) => removeRoadPoint(event, key, controlPoints, index)}
                      />
                    )
                  })}
                </>
              ) : null}
          </g>
        ))}
      </svg>

      <AdminLayoutItem
        rootSelector="[data-main-map-root]"
        label="Turno di"
        rect={mainMapUiLayout.turnPanel}
        editing={layoutEditing}
        onChange={(rect) => updateMainMapUiLayout('turnPanel', rect)}
        zIndex={35}
      >
        <div className="world-map-status-window arka-panel flex h-full w-full min-w-0 items-center overflow-hidden px-3 py-1.5">
          <span className="arka-layout-content shrink-0 text-xs text-arka-text-muted">Turno di:</span>
          <span className="arka-layout-content ml-2 min-w-0 truncate font-bold text-arka-accent">
            {giocatore.nome}
          </span>
        </div>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-main-map-root]"
        label="Monete"
        rect={mainMapUiLayout.coinsPanel}
        editing={layoutEditing}
        onChange={(rect) => updateMainMapUiLayout('coinsPanel', rect)}
        zIndex={35}
      >
        <div className="world-map-status-window arka-panel flex h-full w-full min-w-0 items-center overflow-hidden px-3 py-1.5">
          <span className="arka-layout-content shrink-0 text-xs text-arka-text-muted">Monete:</span>
          <span className="arka-layout-content ml-2 min-w-0 truncate font-bold text-yellow-300">
            ₳ {giocatore.monete}
          </span>
        </div>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-main-map-root]"
        label="Posizione"
        rect={mainMapUiLayout.positionPanel}
        editing={layoutEditing}
        onChange={(rect) => updateMainMapUiLayout('positionPanel', rect)}
        zIndex={35}
      >
        <div className="world-map-status-window arka-panel flex h-full w-full min-w-0 items-center overflow-hidden px-3 py-1.5">
          <span className="arka-layout-content shrink-0 text-xs text-arka-text-muted">Posizione:</span>
          <span className="arka-layout-content ml-2 min-w-0 truncate font-bold text-white">
            {activeNodeName.replace('_', ' ')}
          </span>
        </div>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-main-map-root]"
        label="Azioni"
        rect={mainMapUiLayout.actionsPanel}
        editing={layoutEditing}
        onChange={(rect) => updateMainMapUiLayout('actionsPanel', rect)}
        zIndex={35}
      >
        <div className="world-map-status-window arka-panel flex h-full w-full min-w-0 items-center overflow-hidden px-3 py-1.5">
          <span className="arka-layout-content shrink-0 text-xs text-arka-text-muted">Azioni:</span>
          <span className="arka-layout-content ml-2 min-w-0 truncate font-bold text-white">
            {turnoOverworld.azioniRimaste} azioni · {movimentoDisponibile ? 'Muovi o interagisci' : 'Turno concluso'}
          </span>
        </div>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-main-map-root]"
        label="Entra in"
        rect={mainMapUiLayout.enterButton}
        editing={layoutEditing}
        onChange={(rect) => updateMainMapUiLayout('enterButton', rect)}
        zIndex={35}
      >
        <GameButton
          onClick={interactWithCurrentNode}
          disabled={!aperturaDisponibile}
          tone="primary" className="h-full w-full overflow-hidden px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="arka-layout-content block truncate">{activeNodeName === MAIN_MAP_START_NODE ? 'Prosegui il viaggio' : `${getLocalMap(activeNodeName) ? 'Apri mappa di' : 'Entra in'} ${activeNodeName.replace('_', ' ')}`}</span>
        </GameButton>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-main-map-root]"
        label="Passa turno"
        rect={mainMapUiLayout.passButton}
        editing={layoutEditing}
        onChange={(rect) => updateMainMapUiLayout('passButton', rect)}
        zIndex={35}
      >
        <GameButton
          onClick={passaTurnoOverworld}
          className="h-full w-full overflow-hidden px-2 py-1 text-sm"
        >
          <span className="arka-layout-content block truncate">Passa turno</span>
        </GameButton>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-main-map-root]"
        label="Deposito"
        rect={mainMapUiLayout.depositButton}
        editing={layoutEditing}
        onChange={(rect) => updateMainMapUiLayout('depositButton', rect)}
        zIndex={35}
      >
        <GameButton
          onClick={apriDeposito}
          className="h-full w-full overflow-hidden px-2 py-1 text-sm"
        >
          <span className="arka-layout-content block truncate">Deposito</span>
        </GameButton>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-main-map-root]"
        label="Titolo"
        rect={mainMapUiLayout.titleButton}
        editing={layoutEditing}
        onChange={(rect) => updateMainMapUiLayout('titleButton', rect)}
        zIndex={35}
      >
        <GameButton
          onClick={() => vaiAScena('titolo')}
          className="h-full w-full overflow-hidden px-2 py-1 text-sm"
        >
          <span className="arka-layout-content block truncate">Titolo</span>
        </GameButton>
      </AdminLayoutItem>

      {activeNodeName === 'Roma' && hasUnlockedSecretLocation(giocatore) && !layoutEditing && <GameButton
        className="absolute right-3 top-[42%] z-[35] min-w-36 px-4 py-3" tone="primary"
        onClick={() => vaiAScena('lega')}>Lega Arkamon</GameButton>}

      {previewDestination && reachableNodeNames.includes(previewDestination) && movimentoDisponibile && !layoutEditing && <aside className="world-map-destination" aria-label="Destinazione selezionata">
        <p>Prossima destinazione</p><h2>{previewDestination.replace(/_/g, ' ')}</h2>
        <p>Da {activeNodeName.replace(/_/g, ' ')} · 1 movimento</p>
        <GameButton tone="primary" onClick={() => { muoviAvatarMappaPrincipale(giocatoreAttivo, previewDestination); setSelectedDestination(null); setPreviewDestination(null) }}>Conferma movimento</GameButton>
        {selectedDestination && <GameButton onClick={() => setSelectedDestination(null)}>Annulla destinazione</GameButton>}
      </aside>}
      {previewDestination && reachableNodeNames.includes(previewDestination) && movimentoDisponibile && !layoutEditing && <svg
        className="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
        data-main-map-road-preview={previewDestination}>
        <path d={roadPath(getMainMapJourney(roadRenderItems, activeNodeName, previewDestination))} fill="none"
          stroke="var(--arka-primary)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>}

      {player1NodeName !== SECRET_LOCATION_ID && <MainMapAvatar
        playerId={1}
        nodeName={player1NodeName}
        sameNode={player1NodeName === player2NodeName}
        active={giocatoreAttivo === 1}
        getPosition={(name) => nodePositions[name] ?? COORDS[name]}
        roads={roadRenderItems}
      />}
      {player2NodeName !== SECRET_LOCATION_ID && <MainMapAvatar
        playerId={2}
        nodeName={player2NodeName}
        sameNode={player1NodeName === player2NodeName}
        active={giocatoreAttivo === 2}
        getPosition={(name) => nodePositions[name] ?? COORDS[name]}
        roads={roadRenderItems}
      />}

      {MAPPE.map((luogo) => {
        const coord = COORDS[luogo.nome]
        if (!coord) return null
        const position = nodePositions[luogo.nome] ?? coord
        const isCurrent = luogo.nome === activeNodeName
        const isReachable =
          movimentoDisponibile && reachableNodeNames.includes(luogo.nome)
        const isActionable = isCurrent || isReachable
        const iconSize = getMapNodeIconSize(luogo.nome, coord.tipo)
        return (
          <div
            key={luogo.nome}
            className={`absolute z-20 ${
              layoutEditing ? 'cursor-move' : ''
            }`}
            style={{
              left: `${position.x}%`,
              top: `${position.y}%`,
              transform: 'translate(-50%, -22px)',
            }}
            onPointerDown={(event) => startNodeDrag(event, luogo.nome)}
          >
            <motion.button
              type="button"
              disabled={!layoutEditing && !isActionable}
              whileHover={!layoutEditing && isActionable ? { scale: 1.25 } : {}}
              whileTap={!layoutEditing && isActionable ? { scale: 0.9 } : {}}
              onClick={() => click(luogo.nome, coord.tipo)}
              onMouseEnter={() => setPreviewDestination(isReachable ? luogo.nome : null)}
              onMouseLeave={() => setPreviewDestination(null)}
              onFocus={() => setPreviewDestination(isReachable ? luogo.nome : null)}
              onBlur={() => setPreviewDestination(null)}
              aria-pressed={selectedDestination === luogo.nome}
              aria-label={`${luogo.nome.replace('_', ' ')}${isCurrent ? ', posizione attuale' : isReachable ? ', 1 movimento' : ', non raggiungibile'}`}
              className={`world-map-node flex flex-col items-center justify-center gap-0.5 ${
                !layoutEditing && !isActionable ? 'cursor-default' : ''
              }`}
            >
              <div
                className={`rounded-full transition ${
                  layoutEditing ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-black' : ''
                } ${isCurrent && !layoutEditing ? 'ring-4 ring-white ring-offset-2 ring-offset-black' : ''} ${
                  isReachable && !layoutEditing ? 'ring-4 ring-sky-300 ring-offset-2 ring-offset-black' : ''
                }`}
                style={{ width: iconSize, height: iconSize }}
                data-world-map-marker
              >
                <img
                  src={assetUrl(getMapNodeIcon(luogo.nome, coord.tipo))}
                  alt=""
                  className="h-full w-full object-contain drop-shadow-lg"
                  draggable={false}
                />
              </div>
              <span className={`world-map-node-label arka-layout-content arka-readable-text text-white font-bold whitespace-nowrap leading-tight ${isCurrent || isReachable ? 'is-important' : ''}`}>
                {luogo.nome.replace('_', ' ')}
              </span>
            </motion.button>
          </div>
        )
      })}

      <AdminLayoutItem
        rootSelector="[data-main-map-root]"
        label="Legenda"
        rect={mainMapUiLayout.legend}
        editing={layoutEditing}
        onChange={(rect) => updateMainMapUiLayout('legend', rect)}
        zIndex={35}
      >
        <div className="world-map-legend arka-panel flex h-full w-full flex-col justify-center overflow-hidden px-3 py-2 text-xs">
          <div className="arka-layout-content mb-1 flex items-center gap-2">
            <img src={assetUrl('/ui/start_location.png')} alt="" className="h-4 w-4 object-contain" /> Start
          </div>
          <div className="arka-layout-content mb-1 flex items-center gap-2">
            <img src={assetUrl('/ui/cities.png')} alt="" className="h-4 w-4 object-contain" /> Città
          </div>
          <div className="arka-layout-content mb-1 flex items-center gap-2">
            <img src={assetUrl('/ui/countries.png')} alt="" className="h-4 w-4 object-contain" /> Villaggio
          </div>
          <div className="arka-layout-content mb-1 flex items-center gap-2">
            <img src={assetUrl('/ui/route.png')} alt="" className="h-4 w-4 object-contain" /> Percorso
          </div>
          <div className="arka-layout-content mt-1 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full ring-2 ring-sky-300" /> Raggiungibile
          </div>
        </div>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-main-map-root]"
        label="Footer mappa"
        rect={mainMapUiLayout.footer}
        editing={layoutEditing}
        onChange={(rect) => updateMainMapUiLayout('footer', rect)}
        zIndex={35}
      >
        <TurnSummary compact />
      </AdminLayoutItem>
    </div>
  )
}
