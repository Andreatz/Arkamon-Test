import { useEffect } from 'react'
import { useAdminStore } from '@store/adminStore'
import { applyAdminTheme } from '@/theme/applyAdminTheme'

export function AdminRuntime() {
  const theme = useAdminStore((state) => state.theme)

  useEffect(() => {
    applyAdminTheme(theme)
  }, [theme])

  return null
}
