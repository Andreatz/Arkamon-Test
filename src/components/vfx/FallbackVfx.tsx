import { motion } from 'framer-motion'
import { useVfxPlaybackPreferences } from './useVfxPlaybackPreferences'

export function FallbackVfx({ effectId }: { effectId: number }) {
  const { reducedMotion: reduceMotion, speed } = useVfxPlaybackPreferences(effectId)

  return (
    <motion.div
      key={effectId}
      className="relative h-32 w-32 rounded-full border-4 border-white/80 bg-amber-300/45 shadow-[0_0_55px_24px_rgba(251,191,36,0.68)]"
      initial={reduceMotion ? { opacity: 0.8 } : { opacity: 0, scale: 0.2, rotate: -35 }}
      animate={reduceMotion ? { opacity: 0.8 } : { opacity: [0, 1, 0], scale: [0.2, 1.18, 1.8], rotate: [-35, 12, 40] }}
      transition={{ duration: reduceMotion ? 0 : 0.62 / speed, ease: 'easeOut' }}
      aria-hidden="true"
    >
      <motion.span
        className="absolute inset-[22%] rounded-full bg-white/80 shadow-[0_0_28px_14px_rgba(255,255,255,0.75)]"
        animate={reduceMotion ? { opacity: 0.75 } : { scale: [0.5, 1.25, 0.2], opacity: [0.3, 1, 0] }}
        transition={{ duration: reduceMotion ? 0 : 0.55 / speed }}
      />
    </motion.div>
  )
}
