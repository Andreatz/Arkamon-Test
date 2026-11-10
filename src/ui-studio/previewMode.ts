/** A preview is a separate, volatile application: campaign writes are forbidden. */
export function isUiStudioPreview(): boolean {
  if (typeof window === 'undefined') return false
  const query = new URLSearchParams(window.location?.search ?? '')
  return query.get('uiStudioPreview') === '1' || query.get('uiConcepts') === '1' || query.get('uiReferences') === '1'
}

export const uiPreviewCampaignStorage = {
  getItem: (_name: string): string | null => null,
  setItem: (_name: string, _value: string): void => {},
  removeItem: (_name: string): void => {},
}
