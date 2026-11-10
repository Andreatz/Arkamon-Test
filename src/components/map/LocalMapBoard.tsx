import { useGameMotionPreferences } from '@/settings/gamePreferences'
import { useEffect, useId, useRef, useState } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import type { LocalMapDefinition, LocalMapNode, LocalMapPoint } from '@/data/localMaps'
import { getAdjacentLocalMapNodes, getLocalRoadPath } from '@/engine/localMapMovement'
import { assetUrl } from '@/utils/assetUrl'
import './localMapBoard.css'

export interface LocalMapPlayer {
  id: 1 | 2
  name: string
  nodeId: string
}

export interface LocalMapBoardProps {
  map: LocalMapDefinition
  players: LocalMapPlayer[]
  activePlayerId: 1 | 2
  remainingActions: number
  canMove: boolean
  inputBlocked?: boolean
  interactionLabels?: Record<string, string>
  onMove: (nodeId: string) => boolean | void
  onSelectNode: (nodeId: string) => void
}

interface BoardSize {
  width: number
  height: number
}

function pathString(points: LocalMapPoint[]): string {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
}

/** Distances use the displayed image dimensions, so bends keep the same walking speed. */
function pathTiming(points: LocalMapPoint[], size: BoardSize): { times: number[]; duration: number } {
  const distances = [0]
  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1]
    const after = points[index]
    distances.push(distances[index - 1] + Math.hypot(
      (after.x - before.x) * size.width / 100,
      (after.y - before.y) * size.height / 100,
    ))
  }
  const total = distances[distances.length - 1]
  return {
    times: distances.map((distance, index) => total > 0 ? distance / total : index / (points.length - 1)),
    duration: Math.max(0.35, Math.min(0.65, total / 650)),
  }
}

function LocalMapAvatar({
  map,
  player,
  node,
  active,
  sameNode,
  size,
}: {
  map: LocalMapDefinition
  player: LocalMapPlayer
  node: LocalMapNode
  active: boolean
  sameNode: boolean
  size: BoardSize
}) {
  const controls = useAnimationControls()
  const { reducedMotion, speed } = useGameMotionPreferences()
  const previousNode = useRef(node.id)
  const mounted = useRef(false)
  const animationRunning = useRef(false)
  const animationVersion = useRef(0)
  const queuedJourneys = useRef<Array<{ points: LocalMapPoint[]; size: BoardSize }>>([])
  const avatarSize = Math.max(22, Math.min(56, size.width * 0.045))
  const offset = sameNode ? (player.id === 1 ? -avatarSize * 0.34 : avatarSize * 0.34) : 0
  const fittedOffset = Math.max(
    avatarSize / 2 - node.x * size.width / 100,
    Math.min(offset, size.width - node.x * size.width / 100 - avatarSize / 2),
  )
  const topInset = (point: LocalMapPoint, plane: BoardSize) =>
    Math.max(0, Math.max(22, Math.min(56, plane.width * 0.045)) - point.y * plane.height / 100 + 2)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      animationVersion.current += 1
      queuedJourneys.current = []
      controls.stop()
    }
  }, [controls])

  useEffect(() => {
    const points = getLocalRoadPath(map, previousNode.current, node.id)
    previousNode.current = node.id
    if (!points.length || reducedMotion) {
      animationVersion.current += 1
      animationRunning.current = false
      queuedJourneys.current = []
      controls.stop()
      controls.set({ left: `${node.x}%`, top: `${node.y}%`, marginTop: topInset(node, size) })
      return
    }

    queuedJourneys.current.push({ points, size })
    if (animationRunning.current) return
    animationRunning.current = true
    const version = animationVersion.current
    const followRoads = async () => {
      // Fast consecutive moves queue complete roads. The sprite never cuts
      // diagonally to catch up or jumps to the start of the second movement.
      while (mounted.current && version === animationVersion.current && queuedJourneys.current.length) {
        const journey = queuedJourneys.current.shift()!
        const timing = pathTiming(journey.points, journey.size)
        await controls.start({
          left: journey.points.map((point) => `${point.x}%`),
          top: journey.points.map((point) => `${point.y}%`),
          marginTop: journey.points.map((point) => topInset(point, journey.size)),
          transition: { ease: 'linear', times: timing.times, duration: timing.duration / speed },
        })
      }
      if (version === animationVersion.current) animationRunning.current = false
    }
    void followRoads()
    // Resizing changes the image plane itself; it must not restart a journey.
  }, [controls, map, node.id, reducedMotion, speed])

  useEffect(() => {
    if (!animationRunning.current) controls.set({ marginTop: topInset(node, size) })
  }, [controls, size.height, size.width, node.y])

  return (
    <motion.div
      data-local-map-player={player.id}
      data-node-id={node.id}
      className={`local-map-avatar ${active ? 'local-map-avatar--active' : ''}`}
      initial={{ left: `${node.x}%`, top: `${node.y}%`, marginTop: topInset(node, size) }}
      animate={controls}
      style={{ width: avatarSize, height: avatarSize, marginLeft: fittedOffset }}
      aria-label={`${player.name}, giocatore ${player.id}, ${node.label ?? node.id}${active ? ', turno attivo' : ''}`}
      role="img"
    >
      <img src={assetUrl(`/ui/player${player.id}_avatar.png`)} alt="" draggable={false} />
      <span className={`local-map-avatar-label local-map-avatar-label--${player.id}`}>G{player.id}</span>
    </motion.div>
  )
}

/**
 * The PNG remains intact. Buttons sit on its dots, including explicit new markers; the road graph is
 * used for adjacency and for walking around bends rather than across buildings.
 * Only players present in this location are passed by the containing scene.
 */
export function LocalMapBoard({
  map,
  players,
  activePlayerId,
  remainingActions,
  canMove,
  inputBlocked = false,
  interactionLabels = {},
  onMove,
  onSelectNode,
}: LocalMapBoardProps) {
  const root = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState<BoardSize>({ width: 0, height: 0 })
  const [imageRatio, setImageRatio] = useState(1619 / 971)
  const [previewNode, setPreviewNode] = useState<string | null>(null)
  const instructionsId = useId()
  const activePlayer = players.find((player) => player.id === activePlayerId)
  const currentNode = activePlayer?.nodeId
  const neighbours = currentNode ? getAdjacentLocalMapNodes(map, currentNode) : []

  useEffect(() => {
    const element = root.current
    if (!element) return
    const update = () => {
      const rectangle = element.getBoundingClientRect()
      setBounds({ width: rectangle.width, height: rectangle.height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const width = Math.min(bounds.width, bounds.height * imageRatio)
  const size = { width, height: width / imageRatio }
  const canChooseCurrent = !inputBlocked
  const movementEnabled = canMove && !inputBlocked

  return (
    <div ref={root} className="local-map-board" data-local-map-root={map.id}>
      <p id={instructionsId} className="sr-only">
        Scegli un pallino vicino evidenziato per muoverti lungo la strada.
        Seleziona il pallino su cui ti trovi per vedere il punto d’interazione.
        Usa Tab per scegliere un punto ed Invio per confermare. Azioni rimanenti: {remainingActions}.
      </p>
      <div
        className="local-map-plane"
        style={{ width: size.width || '100%', height: size.height || '100%' }}
        role="group"
        aria-label={`Mappa di ${map.id.replace(/_/g, ' ')}`}
        aria-describedby={instructionsId}
      >
        <img
          className="local-map-image"
          src={assetUrl(map.image)}
          alt={`Strade e punti di ${map.id.replace(/_/g, ' ')}`}
          onLoad={(event) => {
            const image = event.currentTarget
            if (image.naturalWidth && image.naturalHeight) setImageRatio(image.naturalWidth / image.naturalHeight)
          }}
          draggable={false}
        />
        <svg
          className="local-map-road-hints"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {movementEnabled && currentNode && neighbours.map((nextNode) => {
            const points = getLocalRoadPath(map, currentNode, nextNode)
            return points.length ? (
              <path
                key={nextNode}
                d={pathString(points)}
                fill="none"
                data-local-road-preview={previewNode === nextNode ? nextNode : undefined}
                stroke={previewNode === nextNode ? 'var(--arka-primary)' : 'rgba(255,225,116,0.65)'}
                strokeWidth={previewNode === nextNode ? '5' : '2.5'}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null
          })}
        </svg>
        {map.nodes.map((node, index) => {
          const isCurrent = node.id === currentNode
          const isReachable = movementEnabled && neighbours.includes(node.id)
          const enabled = isCurrent ? canChooseCurrent : isReachable
          const label = node.label ?? `Punto ${index + 1}`
          return (
            <button
              key={node.id}
              type="button"
              data-local-map-node={node.id}
              data-reachable={isReachable ? 'true' : 'false'}
              className={`local-map-node${isCurrent ? ' local-map-node--current' : ''}${isReachable ? ' local-map-node--reachable' : ''}`}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              disabled={!enabled}
              aria-current={isCurrent ? 'location' : undefined}
              aria-label={`${label}${isCurrent ? ', posizione attuale; mostra interazione' : isReachable ? ', muoviti qui' : ', non adiacente'}`}
              title={isCurrent ? `${label} · ${interactionLabels[node.id] ?? 'interazione da definire'}` : isReachable ? `Vai a ${label}` : label}
              onMouseEnter={() => setPreviewNode(isReachable ? node.id : null)}
              onMouseLeave={() => setPreviewNode(null)}
              onFocus={() => setPreviewNode(isReachable ? node.id : null)}
              onBlur={() => setPreviewNode(null)}
              onClick={() => {
                if (!enabled) return
                if (isCurrent) onSelectNode(node.id)
                else onMove(node.id)
              }}
            >
              {node.drawMarker && <span className="local-map-node-marker" aria-hidden="true" />}
              <span className="local-map-node-ring" aria-hidden="true" />
            </button>
          )
        })}
        {previewNode && movementEnabled && neighbours.includes(previewNode) && <span className="local-map-move-preview" role="status">Movimento · 1 azione</span>}
        {players.map((player) => {
          const node = map.nodes.find((item) => item.id === player.nodeId)
          if (!node) return null
          const sameNode = players.some((other) => other.id !== player.id && other.nodeId === player.nodeId)
          return (
            <LocalMapAvatar
              key={`${map.id}-${player.id}`}
              map={map}
              player={player}
              node={node}
              active={player.id === activePlayerId}
              sameNode={sameNode}
              size={size}
            />
          )
        })}
      </div>
    </div>
  )
}
