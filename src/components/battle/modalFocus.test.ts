import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeDialogBackgroundInert } from './modalFocus'

class ElementStub {
  inert = false
  parentElement: ElementStub | null = null
  children: ElementStub[] = []
  append(...children: ElementStub[]) {
    this.children.push(...children)
    for (const child of children) child.parentElement = this
  }
}

describe('modal background isolation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('blocks background controls across ancestors and restores their previous availability', () => {
    vi.stubGlobal('HTMLElement', ElementStub)
    const body = new ElementStub()
    const stage = new ElementStub()
    const admin = new ElementStub()
    const battle = new ElementStub()
    const moves = new ElementStub()
    const alreadyDisabled = new ElementStub()
    alreadyDisabled.inert = true
    const dialog = new ElementStub()
    body.append(stage)
    stage.append(admin, battle)
    battle.append(moves, alreadyDisabled, dialog)
    vi.stubGlobal('document', { body })

    const restore = makeDialogBackgroundInert(dialog as unknown as HTMLElement)
    expect(admin.inert).toBe(true)
    expect(moves.inert).toBe(true)
    expect(dialog.inert).toBe(false)
    expect(battle.inert).toBe(false)
    expect(stage.inert).toBe(false)
    restore()
    expect(admin.inert).toBe(false)
    expect(moves.inert).toBe(false)
    expect(alreadyDisabled.inert).toBe(true)
  })

  it('releases and reacquires the same background through a StrictMode effect replay', () => {
    vi.stubGlobal('HTMLElement', ElementStub)
    const body = new ElementStub()
    const battle = new ElementStub()
    const opponentButton = new ElementStub()
    const dialog = new ElementStub()
    body.append(battle)
    battle.append(opponentButton, dialog)
    vi.stubGlobal('document', { body })

    const releaseFirstMount = makeDialogBackgroundInert(dialog as unknown as HTMLElement)
    expect(opponentButton.inert).toBe(true)
    releaseFirstMount()
    expect(opponentButton.inert).toBe(false)
    const releaseReplay = makeDialogBackgroundInert(dialog as unknown as HTMLElement)
    expect(opponentButton.inert).toBe(true)
    releaseReplay()
    expect(opponentButton.inert).toBe(false)
    expect(battle.inert).toBe(false)
  })

  it('does not unlock a new dialog when the previous dialog unmounts after its explicit dismissal', () => {
    vi.stubGlobal('HTMLElement', ElementStub)
    const body = new ElementStub()
    const moves = new ElementStub()
    const dialog = new ElementStub()
    body.append(moves, dialog)
    vi.stubGlobal('document', { body })

    const releaseCoin = makeDialogBackgroundInert(dialog as unknown as HTMLElement)
    releaseCoin()
    expect(moves.inert).toBe(false)
    const releaseStatusDie = makeDialogBackgroundInert(dialog as unknown as HTMLElement)
    expect(moves.inert).toBe(true)
    releaseCoin()
    expect(moves.inert).toBe(true)
    releaseStatusDie()
    expect(moves.inert).toBe(false)
  })
})
