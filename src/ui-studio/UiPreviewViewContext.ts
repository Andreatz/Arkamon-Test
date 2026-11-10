import { createContext } from 'react'

/** Only the isolated design iframe supplies a view; live screens use their own tab state. */
export const UiPreviewViewContext = createContext<string | null>(null)
