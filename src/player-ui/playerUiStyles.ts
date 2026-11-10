/**
 * One stable cascade for every management destination. Route components must
 * not load their own presentation overrides after the active skin: otherwise
 * visiting a lazy screen can change the appearance of a screen already open.
 *
 * Order: primitives -> screen layouts -> shell -> preview concepts -> current
 * reference skin -> supplied artwork -> responsive PNG finish -> splash.
 * The authored rules are kept intact; this module owns their precedence.
 */
import './playerUiPrimitives'
import './liveTeam.css'
import './liveBag.css'
import './liveStore.css'
import './livePlayerUi.css'
import './fullscreenLegacy.css'
import './fullscreenAuxiliary.css'
import './concepts/concept-base.css'
import './concepts/concept-dramatic.css'
import './concepts/concept-editorial.css'
import './reference/reference-shared.css'
import './reference/reference-menu.css'
import './reference/reference-team.css'
import './reference/reference-collections.css'
import './reference/reference-inventory.css'
import './reference/reference-finish.css'
import './reference/reference-artwork.css'
import './reference/reference-artwork-menu.css'
import './reference/reference-artwork-collections.css'
import './reference/reference-artwork-controls.css'
import './reference/reference-png.css'
import './reference/reference-splash.css'
