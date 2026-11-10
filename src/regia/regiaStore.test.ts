import { beforeEach, expect, it } from 'vitest'
import { useRegiaStore } from './regiaStore'

beforeEach(() => useRegiaStore.setState({ paused: false, busy: false, busyReason: '', activities: {} }))
it('pauses only at a safe boundary and keeps independent transition and battle blockers', () => {
  const regia = useRegiaStore.getState()
  regia.setBusy(true, 'Dadi in corso', 'battle')
  regia.setBusy(true, 'Cambio scena', 'transition')
  expect(regia.setPaused(true)).toBe(false)
  regia.setBusy(false, '', 'battle')
  expect(useRegiaStore.getState().busy).toBe(true)
  regia.setBusy(false, '', 'transition')
  expect(regia.setPaused(true)).toBe(true)
  expect(useRegiaStore.getState().paused).toBe(true)
  expect(regia.setPaused(false)).toBe(true)
})
