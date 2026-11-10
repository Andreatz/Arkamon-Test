import type { Stato } from '@/types'
import { percentualeProssimoTickVeleno } from '@/engine/battleEngine'

interface StatusTokenProps {
  stato: Stato
  compact?: boolean
}

const TOKEN_STYLES = {
  Avvelenato: { label: 'PSN', ring: 'border-violet-400 bg-violet-950 text-violet-100' },
  Paralizzato: { label: 'PAR', ring: 'border-amber-300 bg-amber-950 text-amber-100' },
  Addormentato: { label: 'ZZZ', ring: 'border-sky-300 bg-sky-950 text-sky-100' },
  Confuso: { label: 'CONF', ring: 'border-orange-300 bg-orange-950 text-orange-100' },
} as const

/** Vector tokens stay legible beside either HP bar without an external sprite. */
export function StatusToken({ stato, compact = false }: StatusTokenProps) {
  const style = TOKEN_STYLES[stato.tipo]
  const poisonPercent = stato.tipo === 'Avvelenato' ? percentualeProssimoTickVeleno(stato) : 0
  const remaining = Math.max(0, stato.turniRimanenti)
  const detail = stato.tipo === 'Avvelenato' ? `${poisonPercent}%`
    : stato.tipo === 'Addormentato' || stato.tipo === 'Confuso' ? `${remaining}` : '3–6'
  const title = stato.tipo === 'Avvelenato'
    ? `Avvelenato: prossimo danno ${poisonPercent}% degli HP massimi (tick ${poisonPercent / 10}). Nessun tiro di recupero.`
    : stato.tipo === 'Paralizzato'
      ? 'Paralizzato: agisce per secondo. D6: 1–2 non attacca, 3–6 attacca (66,7%). Guarisce solo con una cura.'
      : stato.tipo === 'Addormentato'
        ? `Addormentato: primo turno obbligatorio senza dado; dal secondo si sveglia con 4–6 (50%). Massimo 3 turni, ${remaining} rimanenti.`
        : `Confuso: 50% di colpirsi da solo e perdere il turno; ${remaining} turni rimanenti.`

  return (
    <span
      role="img"
      aria-label={`Stato: ${stato.tipo}`}
      title={title}
      className="inline-flex max-w-full items-center gap-1 align-middle leading-none"
      data-status-token={stato.tipo}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-full border-2 shadow-lg ${style.ring} ${compact ? 'h-5 w-5 sm:h-7 sm:w-7' : 'h-9 w-9'}`}>
        <svg viewBox="0 0 44 44" aria-hidden="true" focusable="false" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="22" cy="22" r="18.5" opacity="0.4" />
          {stato.tipo === 'Avvelenato' && <>
            <path d="M22 6C19 11 11 20 11 27a11 11 0 0 0 22 0c0-7-8-16-11-21Z" fill="currentColor" fillOpacity="0.16" />
            <path d="M22 17c-5 0-8 3-8 7 0 3 2 5 4 6v4h8v-4c2-1 4-3 4-6 0-4-3-7-8-7Z" fill="currentColor" strokeWidth="1.3" />
            <circle cx="18.5" cy="24" r="2" className="fill-violet-950 stroke-violet-950" />
            <circle cx="25.5" cy="24" r="2" className="fill-violet-950 stroke-violet-950" />
            <path d="m22 27-1.5 2h3L22 27Zm-2 4v3m4-3v3" className="stroke-violet-950" />
          </>}
          {stato.tipo === 'Paralizzato' && <>
            <path d="m25 7-13 17h9l-2 13 13-18h-9l2-12Z" fill="currentColor" strokeWidth="1.3" />
            <path d="m9 14 3 2m21 14 3 2M33 9l-2 3M12 32l-2 3" opacity="0.7" />
          </>}
          {stato.tipo === 'Addormentato' && <>
            <path d="M24 8A14 14 0 1 0 35 28 12 12 0 0 1 24 8Z" fill="currentColor" fillOpacity="0.85" strokeWidth="1.3" />
            <path d="M28 10h8l-8 8h8m-7 4h5l-5 5h5" strokeWidth="2" />
            <circle cx="14" cy="9" r="1.2" fill="currentColor" stroke="none" />
          </>}
          {stato.tipo === 'Confuso' && <>
            <path d="M12 23c0-7 9-11 15-7 5 3 4 10-1 11-4 1-7-3-4-6 1-1 3 0 3 1" strokeWidth="2.5" />
            <path d="m31 10 1.1 3.1 3.3.1-2.6 2 1 3.1-2.8-1.8-2.7 1.8.9-3.1-2.6-2 3.3-.1L31 10Zm-17 18 1 2.8 3 .1-2.4 1.9.9 2.8-2.5-1.7-2.5 1.7.9-2.8-2.4-1.9 3-.1 1-2.8Z" fill="currentColor" strokeWidth="0.8" />
          </>}
        </svg>
      </span>
      <span className={`flex min-w-0 flex-col gap-0.5 rounded-md border px-1 py-0.5 font-bold shadow-md ${style.ring} ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
        <span>{style.label}</span>
        <span className={compact ? 'text-[9px]' : 'text-[10px]'}>{detail}</span>
      </span>
    </span>
  )
}
