export function fmtPct(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(2)}%`
}

export function fmtMs(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)} ms`
}

export function fmtDuration(ms: number | null): string {
  if (ms == null) return '—'
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min ${s}s`
  return `${s}s`
}

export function fmtRelative(iso: string | null): string {
  if (!iso) return 'nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.round(diff / 1000)
  if (s < 60) return `há ${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m}min`
  const h = Math.round(m / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.round(h / 24)}d`
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** Cor por nivel de uptime. */
export function uptimeColor(pct: number | null): string {
  if (pct == null) return '#64748b'
  if (pct >= 99.5) return '#22c55e'
  if (pct >= 95) return '#f59e0b'
  return '#ef4444'
}
