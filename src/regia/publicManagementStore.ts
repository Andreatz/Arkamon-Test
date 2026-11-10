import { create } from 'zustand'
import type { ManagementRequest } from './managementPresentation'

/** Volatile opt-in only. Reload, closing tools and changing scene stop the reveal. */
export const usePublicManagement = create<{ request: ManagementRequest | null; present: (request: ManagementRequest) => void; hide: () => void }>(set => ({
  request: null, present: request => set({ request: { ...request } }), hide: () => set({ request: null }),
}))
