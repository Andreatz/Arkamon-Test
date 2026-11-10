import loopReviewQueue from '@/data/animation-loop-review.json'
import { useGameMotionPreferences } from '@/settings/gamePreferences'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { getPokemon } from '@/data'
import { BATTLE_BG_DEFAULT } from '@/data/backgrounds'
import { assetUrl } from '@/utils/assetUrl'
import { ArkamonAttackPreview } from './ArkamonAttackPreview'
import { ArkamonBattleSprite } from './ArkamonBattleSprite'
import { ARKAMON_ASSET_CATALOG, filterArkamonAssetCatalog, getArkamonAssetEntry, getAssetPortraitViewBox, type ArkamonAssetFilter, type ArkamonSpriteAsset } from './arkamonAssetCatalog'
import { ARKAMON_ANIMATION_MANIFEST, getArkamonAnimationAsset, type ArkamonBattleAnimation, type ArkamonSpriteSide } from './arkamonAnimationManifest'
import './darklawAnimationLab.css'

type PreviewBackground = 'battle' | 'checker' | 'light' | 'dark'

type PreviewRun = {
  animation: ArkamonBattleAnimation
  id: number
  sequenceIndex: number | null
}

const ACTIONS: { animation: ArkamonBattleAnimation; label: string; description: string }[] = [
  { animation: 'idle', label: 'Attesa', description: 'Il respiro e il movimento leggero della posa.' },
  { animation: 'attack', label: 'Attacco', description: 'Il filmato di attacco si completa, poi riprende l’attesa.' },
  { animation: 'hit', label: 'Colpito', description: 'La reazione al colpo si completa, poi riprende l’attesa.' },
  { animation: 'ko', label: 'KO', description: 'La caduta e la dissoluzione si completano. Premi Attesa per riprendere.' },
  { animation: 'victory', label: 'Vittoria', description: 'Il festeggiamento si completa, poi riprende l’attesa.' },
]

const ANIMATED_SPECIES = Object.keys(ARKAMON_ANIMATION_MANIFEST)
  .map(Number)
  .filter((id) => ARKAMON_ANIMATION_MANIFEST[id]?.front?.idle)
  .sort((a, b) => a - b)
const ANIMATED_IDS = new Set(ANIMATED_SPECIES)

const ACTION_SEQUENCE: ArkamonBattleAnimation[] = ['idle', 'attack', 'hit', 'victory', 'ko']

function AssetPortrait({ sprite, name }: { sprite: ArkamonSpriteAsset; name: string }) {
  const source = assetUrl(sprite.source)
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState<{ source: string; attempt: number; phase: 'loading' | 'ready' | 'error' }>({ source, attempt: 0, phase: 'loading' })
  const generation = useRef(0)
  const renderedGeneration = generation.current
  const phase = load.source === source && load.attempt === attempt ? load.phase : 'loading'
  useEffect(() => {
    const revision = ++generation.current
    const image = new Image()
    image.decoding = 'async'
    setLoad({ source, attempt, phase: 'loading' })
    image.src = source
    // Decode independently: React does not reliably deliver SVG image events.
    image.decode().then(() => {
      if (generation.current === revision) setLoad({ source, attempt, phase: 'ready' })
    }).catch(() => {
      if (generation.current === revision) setLoad({ source, attempt, phase: 'error' })
    })
    return () => {
      generation.current++
      image.removeAttribute('src')
    }
  }, [source, attempt])
  return <div className="darklaw-lab__asset-image" aria-busy={phase === 'loading'}>
    <svg className="darklaw-lab__asset-portrait" viewBox={getAssetPortraitViewBox(sprite)} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${name}, sprite originale`} aria-hidden={phase !== 'ready'} focusable="false" data-asset-portrait={sprite.source} data-asset-image-state={phase}>
      {phase === 'ready' && <image key={`${source}:${attempt}`} href={source} width={sprite.width} height={sprite.height} onError={() => {
        // A no-store origin may issue a second request for the SVG resource.
        if (generation.current !== renderedGeneration) return
        setLoad(current => current.source === source && current.attempt === attempt ? { ...current, phase: 'error' } : current)
      }} />}
    </svg>
    {phase === 'loading' && <p className="darklaw-lab__asset-message" role="status">Caricamento sprite…</p>}
    {phase === 'error' && <div className="darklaw-lab__asset-message"><p role="status">Lo sprite non è stato caricato. Controlla la connessione e riprova.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Riprova sprite</button></div>}
  </div>
}

/** A comparison using the same sprite renderer as battle. */
export function DarklawAnimationLab({ initialSpeciesId }: { initialSpeciesId?: number } = {}) {
  const { speed } = useGameMotionPreferences()
  const [reviewFrame, setReviewFrame] = useState<number | undefined>()
  const [reviews, setReviews] = useState<Record<string, string>>(() => { try { const value = JSON.parse(localStorage.getItem('arkamon-loop-review-v1') ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} } })
  const [speciesId, setSpeciesId] = useState(initialSpeciesId && getArkamonAssetEntry(initialSpeciesId) ? initialSpeciesId : ANIMATED_SPECIES[0] ?? ARKAMON_ASSET_CATALOG[0]?.id ?? 5)
  const [filter, setFilter] = useState<ArkamonAssetFilter>('all')
  const filteredAssets = filterArkamonAssetCatalog(filter, ANIMATED_IDS)
  const species = getPokemon(speciesId)
  const speciesName = species?.nome ?? `Arkamon #${speciesId}`
  const assetEntry = getArkamonAssetEntry(speciesId)
  const hasAnimation = ANIMATED_IDS.has(speciesId)
  const [background, setBackground] = useState<PreviewBackground>('battle')
  const [scale, setScale] = useState(1)
  const [side, setSide] = useState<ArkamonSpriteSide>('front')
  const staticSprite = assetEntry?.sprites[side]
  const [run, setRun] = useState<PreviewRun>({ animation: 'idle', id: 0, sequenceIndex: null })
  const [attackPreviewBusy, setAttackPreviewBusy] = useState(false)
  const onAttackPreviewBusy = useCallback((busy: boolean) => {
    setAttackPreviewBusy(busy)
    if (busy) setRun(current => ({ animation: 'idle', id: current.id + 1, sequenceIndex: null }))
  }, [])
  const playingSequence = run.sequenceIndex !== null
  const currentAction = ACTIONS.find((action) => action.animation === run.animation) ?? ACTIONS[0]
  const previewAsset = getArkamonAnimationAsset(speciesId, 'front', run.animation)
  const viewport = previewAsset?.viewport
  const canvasCenter = viewport ? viewport.left + viewport.width / 2 : 0
  const canvasWidthFactor = side === 'front' && previewAsset && viewport
    ? 2 * Math.max(canvasCenter, previewAsset.frameWidth - canvasCenter) / viewport.width
    : 1
  const canvasVerticalCenter = viewport ? viewport.top + viewport.height / 2 : 0
  const canvasHeightFactor = side === 'front' && previewAsset && viewport
    ? 2 * Math.max(canvasVerticalCenter, previewAsset.frameHeight - canvasVerticalCenter) / viewport.height
    : 1
  const comparisonStyle = {
    '--darklaw-preview-scale': scale,
    '--darklaw-canvas-width-factor': canvasWidthFactor,
    '--darklaw-canvas-height-factor': canvasHeightFactor,
    '--darklaw-scale-origin-offset': Math.abs(scale - 1),
  } as CSSProperties

  useEffect(() => {
    if (run.animation !== 'idle' || run.sequenceIndex !== 0) return
    const idle = getArkamonAnimationAsset(speciesId, 'front', 'idle')
    if (!idle) return
    const durationMs = idle.durationMs ?? idle.frameCount / idle.fps * 1000
    const timer = window.setTimeout(() => {
      setRun((current) => current.id !== run.id ? current : {
        animation: ACTION_SEQUENCE[1], id: current.id + 1, sequenceIndex: 1,
      })
    }, durationMs / speed)
    return () => window.clearTimeout(timer)
  }, [run.animation, run.id, run.sequenceIndex, speciesId, speed])

  const onAnimationComplete = useCallback((animation: ArkamonBattleAnimation, replayKey: number) => {
    setRun((current) => {
      if (current.id !== replayKey || current.animation !== animation || animation === 'idle') return current
      if (current.sequenceIndex !== null) {
        const nextIndex = current.sequenceIndex + 1
        return nextIndex < ACTION_SEQUENCE.length
          ? { animation: ACTION_SEQUENCE[nextIndex], id: current.id + 1, sequenceIndex: nextIndex }
          : { ...current, sequenceIndex: null }
      }
      return animation === 'ko' ? current : { animation: 'idle', id: current.id + 1, sequenceIndex: null }
    })
  }, [])

  const playAction = (animation: ArkamonBattleAnimation) => {
    setReviewFrame(undefined)
    setRun((current) => ({ animation, id: current.id + 1, sequenceIndex: null }))
  }

  const selectSpecies = (nextSpeciesId: number) => {
    setSpeciesId(nextSpeciesId)
    if (!getArkamonAssetEntry(nextSpeciesId)?.sprites[side]) setSide('front')
    setAttackPreviewBusy(false)
    playAction('idle')
  }

  const selectFilter = (nextFilter: ArkamonAssetFilter) => {
    setFilter(nextFilter)
    const nextEntries = filterArkamonAssetCatalog(nextFilter, ANIMATED_IDS)
    if (!nextEntries.some(entry => entry.id === speciesId) && nextEntries[0]) selectSpecies(nextEntries[0].id)
  }

  const selectSide = (nextSide: ArkamonSpriteSide) => {
    setSide(nextSide)
    playAction('idle')
  }

  const playSequence = () => {
    setReviewFrame(undefined)
    setRun((current) => ({ animation: 'idle', id: current.id + 1, sequenceIndex: 0 }))
  }

  const stageStyle: CSSProperties | undefined = background === 'battle'
    ? { backgroundImage: `url("${BATTLE_BG_DEFAULT}")` }
    : undefined

  return (
    <main className="darklaw-lab" data-darklaw-lab="true" data-preview-species={speciesId} data-asset-status={assetEntry?.status} data-preview-available={hasAnimation}>
      <div className="darklaw-lab__content">
        <header className="darklaw-lab__header">
          <div>
            <p className="darklaw-lab__eyebrow">Arkamon · Anteprima animazione</p>
            <h1>{speciesName}{hasAnimation ? ' prende vita' : ' · Sprite'}<span aria-hidden="true">.</span></h1>
            <p className="darklaw-lab__intro">{hasAnimation ? `Confronta la posa originale con i nuovi filmati di ${speciesName}: attesa, attacco, colpito, vittoria e KO.` : 'Esamina gli sprite forniti. I filmati di questa forma non sono ancora disponibili.'}</p>
          </div>
          <a className="darklaw-lab__back" href="#">Torna al gioco <span aria-hidden="true">↗</span></a>
        </header>

        <section className="darklaw-lab__settings" aria-label="Impostazioni dell’anteprima">
          <label htmlFor="darklaw-preview-filter">
            <span>Catalogo grafico</span>
            <select id="darklaw-preview-filter" value={filter} onChange={event => selectFilter(event.target.value as ArkamonAssetFilter)}>
              <option value="all">Tutti · {ARKAMON_ASSET_CATALOG.length}</option>
              <option value="animated">Animati · {ANIMATED_SPECIES.length}</option>
              <option value="pending-game-data">Dati da definire · {ARKAMON_ASSET_CATALOG.filter(entry => entry.status === 'pending-game-data').length}</option>
            </select>
          </label>
          <label htmlFor="darklaw-preview-species">
            <span>Arkamon</span>
            <select id="darklaw-preview-species" value={speciesId} onChange={(event) => selectSpecies(Number(event.target.value))}>
              {filteredAssets.map(({ id }) => <option key={id} value={id}>#{id} · {getPokemon(id)?.nome ?? 'Dati da definire'}</option>)}
            </select>
          </label>
          <label htmlFor="darklaw-preview-background">
            <span>Sfondo</span>
            <select id="darklaw-preview-background" value={background} onChange={(event) => setBackground(event.target.value as PreviewBackground)}>
              <option value="battle">Battaglia</option>
              <option value="checker">Scacchiera</option>
              <option value="light">Chiaro</option>
              <option value="dark">Scuro</option>
            </select>
          </label>
          <label htmlFor="darklaw-preview-scale">
            <span>Dimensione</span>
            <select id="darklaw-preview-scale" value={scale} onChange={(event) => setScale(Number(event.target.value))}>
              <option value={0.75}>75%</option>
              <option value={1}>100%</option>
              <option value={1.25}>125%</option>
              <option value={1.5}>150%</option>
            </select>
          </label>
          <fieldset className="darklaw-lab__side">
            <legend>Vista</legend>
            <div className="darklaw-lab__segmented">
              <button type="button" aria-pressed={side === 'front'} disabled={!assetEntry?.sprites.front} onClick={() => selectSide('front')}>Frontale</button>
              <button type="button" aria-pressed={side === 'back'} disabled={!assetEntry?.sprites.back} onClick={() => selectSide('back')}>Retro</button>
            </div>
          </fieldset>
          <p className="darklaw-lab__settings-note">{side === 'front' ? 'Stessa dimensione di visualizzazione, limitata allo spazio disponibile.' : 'Il retro usa lo sprite statico esistente.'}{!assetEntry?.sprites.back ? ' Il retro non è ancora disponibile.' : ''}</p>
        </section>

        {!species && <aside className="darklaw-lab__pending" data-asset-pending="true">
          <strong>Nome, mosse e attributi da definire</strong>
          <p>Disponibile solo l’anteprima grafica. Questa forma non è inclusa nella partita, negli incontri o nell’Arkadex giocabile.</p>
        </aside>}

        <div className="darklaw-lab__comparison" style={comparisonStyle} data-preview-side={side} data-preview-background={background} data-preview-scale={scale}>
          <section className="darklaw-lab__card" aria-labelledby="darklaw-static-title">
            <div className="darklaw-lab__card-heading">
              <div><p className="darklaw-lab__card-kicker">Riferimento</p><h2 id="darklaw-static-title">Posa originale</h2></div>
              <span className="darklaw-lab__badge">Statico</span>
            </div>
            <div className={`darklaw-lab__stage darklaw-lab__stage--${background}`} style={stageStyle} data-preview-card="static">
              <span className="darklaw-lab__stage-caption">{speciesName} <span aria-hidden="true">/</span> {side === 'front' ? 'Frontale' : 'Retro'}</span>
              <div className="darklaw-lab__sprite-slot" role={hasAnimation ? 'img' : undefined} aria-label={hasAnimation ? `${speciesName}, posa originale ${side === 'front' ? 'frontale' : 'di retro'}` : undefined}>
                {hasAnimation ? <ArkamonBattleSprite speciesId={speciesId} name={speciesName} side={side} animation="idle" animationEnabled={false} scale={scale} className="darklaw-lab__sprite" /> : staticSprite && <AssetPortrait sprite={staticSprite} name={speciesName} />}
              </div>
            </div>
            <p className="darklaw-lab__card-note">La posa di riferimento resta ferma per facilitare il confronto.</p>
          </section>

          <section className="darklaw-lab__card darklaw-lab__card--animated" aria-labelledby="darklaw-animated-title">
            <div className="darklaw-lab__card-heading">
              <div><p className="darklaw-lab__card-kicker">Anteprima</p><h2 id="darklaw-animated-title">{!hasAnimation ? 'Sprite disponibile' : side === 'front' ? 'Nuovo movimento' : 'Retro esistente'}</h2></div>
              <span className="darklaw-lab__badge darklaw-lab__badge--active">{hasAnimation && side === 'front' ? currentAction.label : 'Statico'}</span>
            </div>
            <div className={`darklaw-lab__stage darklaw-lab__stage--${background}`} style={stageStyle} data-preview-card="animated" data-preview-animation={run.animation}>
              <span className="darklaw-lab__stage-caption">{speciesName} <span aria-hidden="true">/</span> {side === 'front' ? 'Frontale' : 'Retro'}</span>
              <div className="darklaw-lab__sprite-slot" role={hasAnimation ? 'img' : undefined} aria-label={hasAnimation ? `${speciesName} ${side === 'front' ? `animato, ${currentAction.label}` : 'sprite statico'}` : undefined}>
                {hasAnimation ? <ArkamonBattleSprite key={`${speciesId}-${side}`} speciesId={speciesId} name={speciesName} side={side} animation={run.animation} reviewFrame={reviewFrame} animationEnabled={side === 'front' && !attackPreviewBusy} replayKey={run.id} finishActionBeforeIdle={false} onAnimationComplete={onAnimationComplete} scale={scale} className="darklaw-lab__sprite" /> : staticSprite && <AssetPortrait sprite={staticSprite} name={speciesName} />}
              </div>
            </div>
            <p className="darklaw-lab__card-note">{!hasAnimation ? 'Nessun video disponibile per questa forma. Lo sprite resta statico; nessun movimento viene simulato.' : side === 'front' ? 'Ogni azione riproduce il filmato completo. Il KO mantiene l’esito della dissoluzione.' : 'Questa prova riguarda il frontale. Il retro conserva la posa originale.'}</p>
          </section>
        </div>

        {hasAnimation && <section className="darklaw-lab__actions" aria-labelledby="darklaw-actions-title">
          <div className="darklaw-lab__actions-heading">
            <div><p className="darklaw-lab__card-kicker">Prova il movimento</p><h2 id="darklaw-actions-title">Azioni di battaglia</h2></div>
            <button type="button" className="darklaw-lab__play" onClick={playSequence} disabled={side === 'back' || attackPreviewBusy}>
              <span aria-hidden="true">▶</span> {playingSequence ? 'Ricomincia la sequenza' : 'Prova la sequenza'}
            </button>
          </div>
          <div className="darklaw-lab__action-buttons" aria-label="Scegli un’azione">
            {ACTIONS.map((action) => (
              <button key={action.animation} type="button" aria-pressed={run.animation === action.animation} disabled={attackPreviewBusy || side === 'back' && action.animation !== 'idle'} onClick={() => playAction(action.animation)}>
                {action.label}
              </button>
            ))}
          </div>
          <p className="darklaw-lab__status" role="status" aria-live="polite">
            {side === 'back' ? 'Vista di retro statica. Scegli Frontale per provare il movimento.' : playingSequence ? `Sequenza in corso: ${currentAction.label}. Scegli un’azione per interromperla.` : currentAction.description}
          </p>
        </section>}

        {hasAnimation && <section className="darklaw-lab__review" aria-label="Revisione dei fotogrammi sorgente">
          <h2>Revisione del movimento originale</h2>
          <p>Le misure di raccordo segnalano una priorità di controllo, non certificano un difetto visivo. Nessun fotogramma viene generato, eliminato o riordinato.</p>
          <div className="darklaw-lab__action-buttons">
            <button type="button" disabled={!previewAsset || side !== 'front'} onClick={() => setReviewFrame(value => Math.max(0, (value ?? 1) - 1))}>← Fotogramma</button>
            <button type="button" disabled={!previewAsset || side !== 'front'} onClick={() => setReviewFrame(value => value === undefined ? 0 : undefined)}>{reviewFrame === undefined ? 'Ferma al primo fotogramma' : 'Riproduci dall’inizio'}</button>
            <button type="button" disabled={!previewAsset || side !== 'front'} onClick={() => setReviewFrame(value => Math.min((previewAsset?.frameCount ?? 1) - 1, (value ?? 0) + 1))}>Fotogramma →</button>
            <button type="button" disabled={!previewAsset || side !== 'front'} onClick={() => setReviewFrame((previewAsset?.frameCount ?? 1) - 1)}>Ultimo fotogramma</button>
          </div>
          <p role="status">{reviewFrame === undefined ? 'Riproduzione originale' : `Fotogramma sorgente ${reviewFrame + 1} di ${previewAsset?.frameCount}`} · {previewAsset?.fps ?? 24} fps · {previewAsset?.frameCount ?? '—'} fotogrammi</p>
          <label>Fotogramma sorgente<input aria-label="Fotogramma sorgente" type="range" min="0" max={(previewAsset?.frameCount ?? 1) - 1} value={reviewFrame ?? 0} disabled={!previewAsset || side !== 'front'} onChange={event => setReviewFrame(Number(event.target.value))}/></label>
          <h3>{loopReviewQueue.length} animazioni d’attesa da rivedere</h3>
          <div className="darklaw-lab__action-buttons">{loopReviewQueue.map(entry => <button key={entry.speciesId} type="button" aria-pressed={speciesId === entry.speciesId} onClick={() => { selectSpecies(entry.speciesId); setSide('front') }}>#{entry.speciesId} · {getPokemon(entry.speciesId)?.nome} · {entry.ratio}×</button>)}</div>
          {loopReviewQueue.some(entry => entry.speciesId === speciesId) && <label>Esito della tua revisione
            <select value={reviews[String(speciesId)] ?? 'pending'} onChange={event => { const next = { ...reviews, [String(speciesId)]: event.target.value }; setReviews(next); try { localStorage.setItem('arkamon-loop-review-v1', JSON.stringify(next)) } catch { /* Local review remains visible in this session. */ } }}>
              <option value="pending">Da osservare su chiaro, scuro e battaglia</option><option value="accepted">Osservato: raccordo accettabile</option><option value="review">Osservato: richiede revisione artistica</option>
            </select>
          </label>}
        </section>}

        {species && hasAnimation && <ArkamonAttackPreview key={speciesId} speciesId={speciesId} stageStyle={stageStyle} background={background} onBusyChange={onAttackPreviewBusy} />}

        <footer className="darklaw-lab__footer"><span className="darklaw-lab__prototype">Prototipo</span><p>Anteprima delle animazioni. I comandi di questa pagina non modificano la partita.</p></footer>
      </div>
    </main>
  )
}
