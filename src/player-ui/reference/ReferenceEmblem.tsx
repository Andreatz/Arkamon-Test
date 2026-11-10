/** Text symbols cover commands without artwork in the supplied PNG package. */
const commandSymbols: Record<string, string> = {
  'icon-home': '⌂', 'icon-team': '♟', 'icon-bag': '🎒︎',
  'icon-arkadex': '📖︎', 'icon-book': '▤', 'icon-deposit': '▣',
  'icon-box': '▣', 'icon-map': '⌖', 'icon-analysis': '⌕',
  'icon-options': '⚙︎', 'icon-activity': '✧', 'icon-journal': '✎',
  'icon-chronicles': '▤', 'icon-backup': '◆', 'icon-challenges': '⚔︎',
  'type-fire': '♨', 'type-water': '♦', 'type-grass': '❧',
  'type-electric': 'ϟ', 'type-normal': '○', 'type-dark': '☾',
  'type-earth': '▲', 'type-psychic': '◎', 'item-coin': '✦',
  'category-all': '▦', 'category-heal': '✚', 'category-status': '✧',
  'category-capture': '◉', 'category-tools': '⚒︎', 'icon-shop': '⚖︎',
}

export function ReferenceEmblem({ kind, className = '' }: { kind: string; className?: string }) {
  return <span className={`ref-emblem ref-emblem-symbol ${className}`} aria-hidden="true"><ReferenceIcon kind={kind}/></span>
}

export function ReferenceIcon({ kind }: { kind: string }) {
  const symbol = commandSymbols[kind] ?? (kind.includes('book') || kind.includes('journal') ? '▤' : '✧')
  return <span className="ref-line-icon ref-icon-symbol" aria-hidden="true">{symbol}</span>
}
