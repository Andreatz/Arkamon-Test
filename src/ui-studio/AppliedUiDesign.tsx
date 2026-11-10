import { lazy, Suspense } from 'react'
import { useAdminStore } from '@/store/adminStore'
import { hasRuntimeDesign } from './runtimePolicy'

const UiDesignRuntime = lazy(() => import('./UiDesignRuntime').then(module => ({ default: module.UiDesignRuntime })))

/** The registry, custom media and authoring helpers load only for a saved customization. */
export function AppliedUiDesign() {
  const enabled = useAdminStore(state => !!state.theme.design && hasRuntimeDesign(state.theme.design))
  return enabled ? <Suspense fallback={null}><UiDesignRuntime /></Suspense> : null
}
