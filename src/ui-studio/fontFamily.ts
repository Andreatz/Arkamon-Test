/** Shared font lookup is independent of the editor's image catalog. */
export function getUiFontFamily(id: string): string {
  if (id === 'norwester') return "'Arkamon Norwester', 'Arial Narrow', Arial, sans-serif"
  if (id === 'chela') return "'Chela One', Arial, sans-serif"
  if (id === 'azonix') return "'Azonix', Arial, sans-serif"
  if (id === 'system') return 'system-ui, sans-serif'
  return "'UiUploaded_" + id.replace(/[^a-zA-Z0-9_-]/g, '_') + "', 'Arkamon Norwester', Arial, sans-serif"
}
