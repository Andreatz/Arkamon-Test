import { lazy, Suspense, useEffect, useState } from 'react'
import { useGameStore } from '@store/gameStore'
import { TitoloScene } from '@scenes/TitoloScene'
import { SceneTransition } from '@/components/transitions/SceneTransition'
import { preloadSceneTransitionArtwork } from '@/components/transitions/ArkamonDiceArtwork'
import type { NavigazioneScena, SceneId } from '@/types'
import { AudioController } from '@components/AudioController'
import { AdminOverlay } from '@/admin/AdminOverlay'
import { AdminRuntime } from '@/admin/AdminRuntime'
import { getLocalMap } from '@/data/localMaps'
import { PlayerTools } from '@/settings/PlayerTools'
import { MotionConfig } from 'framer-motion'
import { useGameMotionPreferences, useGamePreferences } from '@/settings/gamePreferences'
import { ChallengeBanner } from '@/challenges/ChallengeBanner'
import { SaveFailureNotice } from '@/save/SaveFailureNotice'
import { SessionGate } from '@/session/SessionGate'
import { PublicPresentationBridge } from '@/regia/PublicPresentationBridge'
import { RegiaPause } from '@/regia/RegiaPause'
import { AppliedUiDesign } from '@/ui-studio/AppliedUiDesign'
import { isUiStudioPreview } from '@/ui-studio/previewMode'

const AudioLab = lazy(() => import('@/components/audio/AudioLab').then((module) => ({ default: module.AudioLab })))
const BattleRulesLab = lazy(() => import('@/components/battle/BattleRulesLab').then((module) => ({ default: module.BattleRulesLab })))
const SceneTransitionLab = lazy(() => import('@/components/transitions/SceneTransitionLab').then((module) => ({ default: module.SceneTransitionLab })))
const VfxGallery = lazy(() => import('@/components/vfx/VfxGallery').then((module) => ({ default: module.VfxGallery })))
const BattleDiceLab = lazy(() => import('@/components/battle/BattleDiceLab').then((module) => ({ default: module.BattleDiceLab })))
const DepositLab = lazy(() => import('@/components/deposit/DepositLab').then((module) => ({ default: module.DepositLab })))
const DarklawAnimationLab = lazy(() => import('@/components/arkamon/DarklawAnimationLab').then((module) => ({ default: module.DarklawAnimationLab })))
const MappaGrigliaScene = lazy(() => import('@scenes/MappaGrigliaScene').then((module) => ({ default: module.MappaGrigliaScene })))
const LaboratorioScene = lazy(() => import('@scenes/LaboratorioScene').then((module) => ({ default: module.LaboratorioScene })))
const MappaPrincipaleScene = lazy(() => import('@scenes/MappaPrincipaleScene').then((module) => ({ default: module.MappaPrincipaleScene })))
const BattagliaScene = lazy(() => import('@scenes/BattagliaScene').then((module) => ({ default: module.BattagliaScene })))
const PercorsoScene = lazy(() => import('@scenes/PercorsoScene').then((module) => ({ default: module.PercorsoScene })))
const CittaScene = lazy(() => import('@scenes/CittaScene').then((module) => ({ default: module.CittaScene })))
const DepositoScene = lazy(() => import('@scenes/DepositoScene').then((module) => ({ default: module.DepositoScene })))
const EvoluzioneScene = lazy(() => import('@scenes/EvoluzioneScene').then((module) => ({ default: module.EvoluzioneScene })))
const LeagueScene = lazy(() => import('@/league/LeagueScene').then((module) => ({ default: module.LeagueScene })))
const UiStudioEditor = lazy(() => import('@/ui-studio/UiStudioEditor').then(module => ({ default: module.UiStudioEditor })))
const UiStudioPreview = lazy(() => import('@/ui-studio/UiStudioPreview').then(module => ({ default: module.UiStudioPreview })))
const UiAssetExamples = lazy(() => import('@/ui-studio/UiAssetExamples').then(module => ({ default: module.UiAssetExamples })))
const UiConceptLab = lazy(() => import('@/ui-studio/UiConceptLab').then(module => ({ default: module.UiConceptLab })))
const ReferenceUiPreview = lazy(() => import('@/ui-studio/ReferenceUiPreview').then(module => ({ default: module.ReferenceUiPreview })))

/**
 * Router delle scene.
 * Sostituisce il sistema VBA delle slide PowerPoint identificate da ID.
 * Aggiungi qui ogni nuova scena man mano che la implementi.
 */
function App() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => { const sync = () => setHash(window.location.hash); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync) }, [])
  const scenaCorrente = useGameStore((s) => s.scenaCorrente)
  const campaignRevision = useGameStore((s) => s.campaignRevision)
  const { reducedMotion } = useGameMotionPreferences()
  const localMapOpen = (scenaCorrente.scena === 'citta' || scenaCorrente.scena === 'percorso')
    && !!getLocalMap(String(scenaCorrente.payload?.luogo ?? (scenaCorrente.scena === 'citta' ? 'Venezia' : 'Percorso_1')))

  useEffect(() => {
    // Title commands warm this artwork on intent. Read-only previews and the
    // reduced-motion path never display it and must not fetch 1.3 MB of dice.
    if (!isUiStudioPreview() && !reducedMotion && scenaCorrente.scena !== 'titolo') preloadSceneTransitionArtwork()
  }, [reducedMotion, scenaCorrente.scena])

  if (new URLSearchParams(window.location.search).get('uiReferences') === '1' || new URLSearchParams(window.location.search).get('uiConcepts') === '1' && new URLSearchParams(window.location.search).get('legacyConcepts') !== '1') {
    return <Suspense fallback={<div role="status">Preparazione della nuova interfaccia…</div>}><ReferenceUiPreview /></Suspense>
  }
  if (new URLSearchParams(window.location.search).get('uiConcepts') === '1') {
    return <Suspense fallback={<div role="status">Preparazione delle nuove interfacce…</div>}><UiConceptLab /></Suspense>
  }
  if (new URLSearchParams(window.location.search).get('uiStudioPreview') === '1') {
    if (new URLSearchParams(window.location.search).get('assetExamples') === '1') {
      return <Suspense fallback={<div role="status">Preparazione esempi…</div>}><UiAssetExamples /></Suspense>
    }
    return <Suspense fallback={<div role="status">Preparazione anteprima…</div>}><UiStudioPreview /></Suspense>
  }
  if (hash === '#ui-studio') {
    return <Suspense fallback={<div role="status">Caricamento editor interfaccia…</div>}><UiStudioEditor onClose={() => { window.location.hash = '' }} /></Suspense>
  }

  if (hash === '#battle-rules-lab') return <LabShell><BattleRulesLab /></LabShell>

  if (hash === '#audio-lab') {
    return <LabShell><Suspense fallback={<div role="status">Caricamento laboratorio audio…</div>}><AudioLab /></Suspense></LabShell>
  }

  if (hash === '#transition-lab') {
    return <LabShell><SceneTransitionLab /></LabShell>
  }

  if (hash === '#vfx-lab') {
    return <LabShell><VfxGallery /></LabShell>
  }

  if (hash === '#dice-lab') {
    return <LabShell><BattleDiceLab /></LabShell>
  }

  if (hash === '#deposit-lab') {
    return <LabShell><DepositLab /></LabShell>
  }

  if (hash === '#arkamon-lab') {
    return <LabShell><DarklawAnimationLab /></LabShell>
  }

  return (
    <div className={`arka-stage${localMapOpen ? ' arka-stage--local-map' : ''}${scenaCorrente.scena === 'lega' ? ' arka-stage--league' : ''}`}>
      <AdminRuntime />
      <AppliedUiDesign />
      <AdminOverlay />
      <PublicPresentationBridge />
      <RegiaPause />
      <PlayerTools />
      <SaveFailureNotice />
      <ChallengeBanner key={`challenge-banner-${campaignRevision}`} />
      <SceneTransition key={campaignRevision} navigation={scenaCorrente} renderScene={renderPresentedScene}>
        <AudioController />
      </SceneTransition>
    </div>
  )
}

function LabShell({ children }: { children: React.ReactNode }) {
  return <div className="relative flex h-full w-full min-w-0 shrink-0 items-center justify-center [&>main]:w-full [&>main]:min-w-0 [&>main]:shrink-0">
    <AdminRuntime /><AppliedUiDesign /><AdminOverlay /><PlayerTools /><Suspense fallback={<div role="status">Caricamento laboratorio…</div>}>{children}</Suspense>
  </div>
}

function renderPresentedScene(navigation: NavigazioneScena) {
  return <Suspense fallback={<div className="flex h-full items-center justify-center p-4 text-arka-text-muted" role="status">Caricamento scena…</div>}>
    {renderScena(navigation.scena)}
  </Suspense>
}

function renderScena(scena: SceneId) {
  switch (scena) {
    case 'lega':
      return <LeagueScene />
    case 'titolo':
      return <TitoloScene />
    case 'laboratorio':
      return <LaboratorioScene />
    case 'mappa-principale':
      return <MappaPrincipaleScene />
    case 'mappa-griglia':
      return <Suspense fallback={<div role="status">Caricamento mappa…</div>}><MappaGrigliaScene /></Suspense>
    case 'battaglia':
      return <BattagliaScene />
    case 'percorso':
      return <PercorsoScene />
    case 'citta':
      return <CittaScene />
    case 'deposito':
      return <DepositoScene />
    case 'evoluzione':
      return <EvoluzioneScene />
    default:
      return (
        <div className="flex items-center justify-center h-full text-arka-text-muted">
          Scena non implementata: <span className="text-white ml-2">{scena}</span>
        </div>
      )
  }
}

function GameApp() {
  const motion = useGamePreferences((state) => state.reducedMotion)
  return <MotionConfig reducedMotion={motion === 'system' ? 'user' : motion === 'on' ? 'always' : 'never'}><SessionGate><App /></SessionGate></MotionConfig>
}
export default GameApp
