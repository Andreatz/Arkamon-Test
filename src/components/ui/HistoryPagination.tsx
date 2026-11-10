/** Presentation-only paging: complete histories remain in their existing stores. */
export function HistoryPagination({ page, count, pageSize, onPageChange, label }: { page: number; count: number; pageSize: number; onPageChange: (page: number) => void; label: string }) {
  const pages = Math.max(1, Math.ceil(count / pageSize)), current = Math.min(page, pages - 1)
  if (pages === 1) return null
  return <nav className="pu-history-pages" aria-label={label}>
    <button type="button" disabled={current === 0} onClick={() => onPageChange(current - 1)}>Precedenti</button>
    <span aria-live="polite">Pagina {current + 1} / {pages}</span>
    <button type="button" disabled={current + 1 === pages} onClick={() => onPageChange(current + 1)}>Successivi</button>
  </nav>
}
