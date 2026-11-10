export const UI_CONCEPTS = [
  { id: 'eclisse', name: 'Eclisse', number: '01', subtitle: 'Cinema e materia', description: 'Grafite, bronzo e luce morbida. Navigazione laterale e spazio al compagno.', colors: ['#13181b', '#d4aa75', '#344747'] },
  { id: 'atlante', name: 'Atlante', number: '02', subtitle: 'Ordine editoriale', description: 'Carta chiara, blu profondo e titoli serif. Informazioni ordinate come un atlante.', colors: ['#f4f5ef', '#124d64', '#dce9e7'] },
  { id: 'impulso', name: 'Impulso', number: '03', subtitle: 'Energia tattica', description: 'Viola, lime e geometrie nette. Un’interfaccia rapida, tecnica ed essenziale.', colors: ['#111018', '#c5ff55', '#a291ff'] },
  { id: 'taccuino', name: 'Taccuino', number: '04', subtitle: 'Diario di viaggio', description: 'Carta calda, verde bosco e terracotta. Un quaderno da portare in esplorazione.', colors: ['#eee3c9', '#375544', '#ad6042'] },
  { id: 'prisma', name: 'Prisma', number: '05', subtitle: 'Avventura pop', description: 'Blu, corallo e forme morbide. Controlli ampi e navigazione in basso.', colors: ['#e8f0ff', '#394ec7', '#ef826e'] },
] as const

export type UiConcept = typeof UI_CONCEPTS[number]['id']
export function resolveUiConcept(value: string | null | undefined): UiConcept {
  return UI_CONCEPTS.find(concept => concept.id === value)?.id ?? 'eclisse'
}
