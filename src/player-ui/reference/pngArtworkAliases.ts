/** Compatibility names describe UI roles; every active file now comes from Arkamon.zip. */
export const PNG_ARTWORK_ALIASES: Record<string, string> = {
  'button-hover': 'button-normal',
  'tab-active': 'tab-frame', 'tab-middle': 'tab-frame', 'tab-end': 'tab-frame',
  'menu-card-normal': 'panel-modular', 'menu-card-selected': 'panel-modular',
  'card-normal': 'item-slot', 'card-selected': 'item-slot',
  'creature-tile-normal': 'item-slot', 'creature-tile-selected': 'item-slot',
  'team-row-normal': 'team-row', 'team-row-selected': 'team-row', 'team-row-hover': 'team-row', 'team-row-disabled': 'team-row',
  'creature-row-normal': 'team-row', 'creature-row-selected': 'team-row', 'creature-row-hover': 'team-row', 'creature-row-disabled': 'team-row',
  'summoning-ring': 'portrait-frame', 'evolution-empty': 'item-slot', 'evolution-locked': 'locked-control',
  'purchase-button': 'button-normal', 'purchase-button-active': 'button-selected',
  'header-empty': 'title-plaque', 'corner-gold': 'corner', 'corner-rune': 'corner',
  'arrow-left': 'back-control', 'arrow-right': 'back-control',
  'medal-1': 'medal-grass', 'medal-2': 'medal-water', 'medal-3': 'medal-electric', 'medal-4': 'medal-fire',
  'medal-5': 'medal-earth', 'medal-6': 'medal-normal', 'medal-7': 'medal-dark', 'medal-8': 'medal-psychic',
  'medal-empty': 'medal-normal', 'icon-search': 'search-icon', 'icon-filter': 'filter-icon',
}
