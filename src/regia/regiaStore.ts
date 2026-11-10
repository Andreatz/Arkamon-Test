import { create } from 'zustand'

interface RegiaState {
  paused: boolean
  busy: boolean
  busyReason: string
  activities: Record<string, string>
  setBusy: (busy: boolean, reason?: string, source?: string) => void
  setPaused: (paused: boolean) => boolean
}

/** Pauses are taken between resolved actions: no timer or remote command is cut in half. */
export const useRegiaStore = create<RegiaState>((set, get) => ({
  paused: false, busy: false, busyReason: '', activities: {},
  setBusy: (busy, reason = 'Attendi la fine dell’azione in corso.', source = 'battle') => {
    const previous = get().activities
    if ((busy && previous[source] === reason) || (!busy && !(source in previous))) return
    const activities = { ...previous }
    if (busy) activities[source] = reason
    else delete activities[source]
    const reasons = Object.values(activities)
    set({ activities, busy: reasons.length > 0, busyReason: reasons[0] ?? '' })
  },
  setPaused: (paused) => {
    if (paused && get().busy) return false
    set({ paused }); return true
  },
}))
