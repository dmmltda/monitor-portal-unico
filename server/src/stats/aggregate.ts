import { prisma } from '../lib/db.js'
import { env } from '../env.js'
import { tzDayWindows } from '../lib/time.js'
import { TARGETS, targetByKey } from '../probe/targets.js'

export interface TargetCurrentStatus {
  key: string
  label: string
  description: string
  url: string
  up: boolean | null // null = ainda sem dados
  statusCode: number | null
  latencyMs: number | null
  lastCheckedAt: string | null
  lastError: string | null
}

export interface TargetSummary {
  key: string
  label: string
  totalChecks: number
  upChecks: number
  uptimePct: number | null
  avgLatencyMs: number | null
  p95LatencyMs: number | null
}

export interface IncidentView {
  id: string
  targetKey: string
  targetLabel: string
  startedAt: string
  endedAt: string | null
  ongoing: boolean
  durationMs: number | null
  failedChecks: number
  lastError: string | null
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)] ?? null
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length)
}

/** Status atual de cada alvo (ultima verificacao). */
export async function getCurrentStatus(): Promise<TargetCurrentStatus[]> {
  return Promise.all(
    TARGETS.map(async (t) => {
      const last = await prisma.probeResult.findFirst({
        where: { targetKey: t.key },
        orderBy: { checkedAt: 'desc' },
      })
      return {
        key: t.key,
        label: t.label,
        description: t.description,
        url: t.url,
        up: last ? last.ok : null,
        statusCode: last?.statusCode ?? null,
        latencyMs: last?.latencyMs ?? null,
        lastCheckedAt: last ? last.checkedAt.toISOString() : null,
        lastError: last?.error ?? null,
      }
    }),
  )
}

/** Resumo por alvo em uma janela (em horas). */
export async function getSummary(rangeHours: number): Promise<TargetSummary[]> {
  const since = new Date(Date.now() - rangeHours * 3_600_000)
  return Promise.all(
    TARGETS.map(async (t) => {
      const rows = await prisma.probeResult.findMany({
        where: { targetKey: t.key, checkedAt: { gte: since } },
        select: { ok: true, latencyMs: true },
      })
      const total = rows.length
      const up = rows.filter((r) => r.ok).length
      const latencies = rows
        .filter((r) => r.ok && r.latencyMs != null)
        .map((r) => r.latencyMs as number)
      return {
        key: t.key,
        label: t.label,
        totalChecks: total,
        upChecks: up,
        uptimePct: total > 0 ? Number(((up / total) * 100).toFixed(3)) : null,
        avgLatencyMs: avg(latencies),
        p95LatencyMs: percentile(latencies, 95),
      }
    }),
  )
}

export interface HistoryPoint {
  t: string // inicio do bucket (ISO)
  uptimePct: number | null
  avgLatencyMs: number | null
}

/** Serie temporal agregada por bucket (minutos) para um alvo. */
export async function getHistory(
  targetKey: string,
  rangeHours: number,
  bucketMinutes: number,
): Promise<HistoryPoint[]> {
  const since = new Date(Date.now() - rangeHours * 3_600_000)
  const rows = await prisma.probeResult.findMany({
    where: { targetKey, checkedAt: { gte: since } },
    select: { ok: true, latencyMs: true, checkedAt: true },
    orderBy: { checkedAt: 'asc' },
  })

  const bucketMs = bucketMinutes * 60_000
  const buckets = new Map<number, { up: number; total: number; lat: number[] }>()
  for (const r of rows) {
    const bucket = Math.floor(r.checkedAt.getTime() / bucketMs) * bucketMs
    const b = buckets.get(bucket) ?? { up: 0, total: 0, lat: [] }
    b.total += 1
    if (r.ok) {
      b.up += 1
      if (r.latencyMs != null) b.lat.push(r.latencyMs)
    }
    buckets.set(bucket, b)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ts, b]) => ({
      t: new Date(ts).toISOString(),
      uptimePct: b.total > 0 ? Number(((b.up / b.total) * 100).toFixed(2)) : null,
      avgLatencyMs: avg(b.lat),
    }))
}

export interface UptimeDay {
  date: string // YYYY-MM-DD no fuso configurado
  monitored: boolean // havia monitoramento neste dia?
  uptimePct: number | null
  downtimeMs: number
  incidents: { startedAt: string; endedAt: string | null; durationMs: number; lastError: string | null }[]
}

export interface ServiceUptime {
  key: string
  label: string
  description: string
  url: string
  windowUptimePct: number | null
  days: UptimeDay[]
}

/** Sobreposicao (ms) de [aStart,aEnd] com [bStart,bEnd]. */
function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

/**
 * Timeline estilo status page: uptime por dia nos ultimos `days` dias.
 * Uptime e derivado da DURACAO DOS INCIDENTES (nao do nº de probes), entao
 * independe da frequencia de coleta. Dias antes do inicio do monitoramento
 * ficam como "sem dados".
 */
export async function getUptimeTimeline(days: number): Promise<ServiceUptime[]> {
  const windows = tzDayWindows(env.TZ, days)
  const rangeStart = windows[0]!.start
  const rangeEnd = windows[windows.length - 1]!.end
  const now = Date.now()

  return Promise.all(
    TARGETS.map(async (t) => {
      const [firstProbe, incidents] = await Promise.all([
        prisma.probeResult.findFirst({
          where: { targetKey: t.key },
          orderBy: { checkedAt: 'asc' },
          select: { checkedAt: true },
        }),
        prisma.incident.findMany({
          where: {
            targetKey: t.key,
            startedAt: { lt: rangeEnd },
            OR: [{ endedAt: null }, { endedAt: { gte: rangeStart } }],
          },
          orderBy: { startedAt: 'asc' },
        }),
      ])
      const monitoringSince = firstProbe ? firstProbe.checkedAt.getTime() : null

      let totalPeriod = 0
      let totalDowntime = 0

      const dayList: UptimeDay[] = windows.map((w) => {
        const dayStart = w.start.getTime()
        const dayEnd = w.end.getTime()
        const monitored = monitoringSince != null && monitoringSince < dayEnd

        if (!monitored) {
          return { date: w.dateLabel, monitored: false, uptimePct: null, downtimeMs: 0, incidents: [] }
        }

        const effStart = Math.max(dayStart, monitoringSince as number)
        const effEnd = Math.min(dayEnd, now)
        const periodMs = Math.max(0, effEnd - effStart)

        let downtimeMs = 0
        const dayIncidents = incidents
          .filter((i) => i.startedAt.getTime() < dayEnd && (i.endedAt?.getTime() ?? now) >= dayStart)
          .map((i) => {
            const s = i.startedAt.getTime()
            const e = i.endedAt?.getTime() ?? now
            downtimeMs += overlapMs(s, e, effStart, effEnd)
            return {
              startedAt: i.startedAt.toISOString(),
              endedAt: i.endedAt ? i.endedAt.toISOString() : null,
              durationMs: e - s,
              lastError: i.lastError,
            }
          })

        totalPeriod += periodMs
        totalDowntime += downtimeMs

        const uptimePct =
          periodMs > 0 ? Math.max(0, Math.min(100, Number((((periodMs - downtimeMs) / periodMs) * 100).toFixed(3)))) : null

        return { date: w.dateLabel, monitored: true, uptimePct, downtimeMs, incidents: dayIncidents }
      })

      const windowUptimePct =
        totalPeriod > 0 ? Number((((totalPeriod - totalDowntime) / totalPeriod) * 100).toFixed(3)) : null

      return {
        key: t.key,
        label: t.label,
        description: t.description,
        url: t.url,
        windowUptimePct,
        days: dayList,
      }
    }),
  )
}

/** Incidentes recentes (abertos primeiro). */
export async function getIncidents(rangeHours: number, limit = 100): Promise<IncidentView[]> {
  const since = new Date(Date.now() - rangeHours * 3_600_000)
  const rows = await prisma.incident.findMany({
    where: { OR: [{ endedAt: null }, { startedAt: { gte: since } }] },
    orderBy: [{ endedAt: 'asc' }, { startedAt: 'desc' }],
    take: limit,
  })
  return rows.map((i) => {
    const end = i.endedAt ?? null
    return {
      id: i.id,
      targetKey: i.targetKey,
      targetLabel: targetByKey.get(i.targetKey)?.label ?? i.targetKey,
      startedAt: i.startedAt.toISOString(),
      endedAt: end ? end.toISOString() : null,
      ongoing: end === null,
      durationMs: end ? end.getTime() - i.startedAt.getTime() : Date.now() - i.startedAt.getTime(),
      failedChecks: i.failedChecks,
      lastError: i.lastError,
    }
  })
}
