import { createContext } from 'react'

/** A nested tool may consume Back before its containing dialog closes. */
export type DialogBackHandler = (event: KeyboardEvent) => boolean
export const DialogNavigationContext = createContext<((handler: DialogBackHandler) => () => void) | null>(null)
