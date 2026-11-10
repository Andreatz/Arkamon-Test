export const PUBLIC_MEDIA_MAX_BYTES: number
export const PUBLIC_MEDIA_MAX_FILES: number
export const PUBLIC_MEDIA_BUFFER_FILES: number
export const PUBLIC_MEDIA_BUFFER_BYTES: number
export const PUBLIC_MEDIA_EXTENSIONS: Readonly<Record<string, string>>
export function publicMediaId(source: unknown): string | undefined
export function publicSnapshotMediaIds(snapshot: unknown): string[] | null
