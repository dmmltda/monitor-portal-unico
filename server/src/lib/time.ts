/** Utilitarios de fuso horario sem dependencia externa. */

function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, number> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value)
  }
  const asUTC = Date.UTC(
    map.year!,
    (map.month ?? 1) - 1,
    map.day!,
    map.hour === 24 ? 0 : map.hour!,
    map.minute!,
    map.second!,
  )
  return asUTC - date.getTime()
}

export interface DayWindow {
  start: Date
  end: Date
  /** Rotulo YYYY-MM-DD do dia no fuso. */
  dateLabel: string
}

/** Janela [00:00, 24:00) do dia atual (ou de `ref`) no fuso informado. */
export function tzDayWindow(timeZone: string, ref: Date = new Date()): DayWindow {
  const offset = tzOffsetMs(timeZone, ref)
  const wall = new Date(ref.getTime() + offset)
  const y = wall.getUTCFullYear()
  const m = wall.getUTCMonth()
  const d = wall.getUTCDate()
  const startWallUTC = Date.UTC(y, m, d, 0, 0, 0, 0)
  const start = new Date(startWallUTC - offset)
  const end = new Date(start.getTime() + 24 * 3_600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { start, end, dateLabel: `${y}-${pad(m + 1)}-${pad(d)}` }
}

/** Janelas de dia (mais antigo -> mais recente) para os ultimos `days` dias no fuso. */
export function tzDayWindows(timeZone: string, days: number, ref: Date = new Date()): DayWindow[] {
  const today = tzDayWindow(timeZone, ref)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const out: DayWindow[] = []
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(today.start.getTime() - i * 24 * 3_600_000)
    const end = new Date(start.getTime() + 24 * 3_600_000)
    out.push({ start, end, dateLabel: fmt.format(start) })
  }
  return out
}

export function formatDateBR(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatTimeBR(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min ${s}s`
  return `${s}s`
}
