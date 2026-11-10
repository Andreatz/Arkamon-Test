import { useGameStore } from '@/store/gameStore'
export function TeamRuleNotice() {
  const message = useGameStore((state) => state.teamRuleMessage)
  const dismiss = useGameStore((state) => state.dismissTeamRuleMessage)
  if (!message) return null
  return <aside role="alert" className="fixed left-1/2 top-3 z-[1100] w-[min(90vw,42rem)] -translate-x-1/2 rounded-lg border border-amber-300 bg-slate-950 p-3 text-white shadow-xl">
    <p>{message}</p><button className="mt-2 rounded border px-3 py-2" onClick={dismiss}>Ho capito</button>
  </aside>
}
