import { BATTLE_BG_DEFAULT, DEPOSIT_BG, getBackground } from '@/data/backgrounds'
import { assetUrl } from '@/utils/assetUrl'
import type { PlayerUiScreen } from '../navigation'
import type { ReadySplashArtwork } from './SplashArtworkContext'
import { supportsSplashArtwork } from './splashArtwork'

/** Replace these paths with the backgrounds supplied by the artist. No UI is baked into them. */
export const REFERENCE_BACKGROUNDS: Partial<Record<PlayerUiScreen, string>> = {
  partita: '/backgrounds/venezia.png',
  squadra: '/backgrounds/battle_forest.jpg',
  deposito: '/backgrounds/deposito.png',
  arkadex: '/backgrounds/route_4.png',
  analisi: '/backgrounds/battle_forest.jpg',
  borsa: '/backgrounds/deposito.png',
  negozio: '/backgrounds/venezia.png',
}
export function referenceScreenBackground(screen: PlayerUiScreen, location: string, splash?: ReadySplashArtwork | null): string {
  if (supportsSplashArtwork(screen) && splash) return splash.src
  const source = REFERENCE_BACKGROUNDS[screen]
  return source ? assetUrl(source) : getBackground(location) ?? (screen === 'deposito' ? DEPOSIT_BG : BATTLE_BG_DEFAULT)
}
