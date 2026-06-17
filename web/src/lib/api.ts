import { z } from 'zod'

const currentStatusSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  url: z.string(),
  up: z.boolean().nullable(),
  statusCode: z.number().nullable(),
  latencyMs: z.number().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastError: z.string().nullable(),
})

const summarySchema = z.object({
  key: z.string(),
  label: z.string(),
  totalChecks: z.number(),
  upChecks: z.number(),
  uptimePct: z.number().nullable(),
  avgLatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
})

export const statusResponseSchema = z.object({
  generatedAt: z.string(),
  current: z.array(currentStatusSchema),
  summary: z.object({
    last24h: z.array(summarySchema),
    last7d: z.array(summarySchema),
  }),
})

export const historyResponseSchema = z.object({
  targetKey: z.string(),
  hours: z.number(),
  bucketMinutes: z.number(),
  points: z.array(
    z.object({
      t: z.string(),
      uptimePct: z.number().nullable(),
      avgLatencyMs: z.number().nullable(),
    }),
  ),
})

export const incidentsResponseSchema = z.object({
  incidents: z.array(
    z.object({
      id: z.string(),
      targetKey: z.string(),
      targetLabel: z.string(),
      startedAt: z.string(),
      endedAt: z.string().nullable(),
      ongoing: z.boolean(),
      durationMs: z.number().nullable(),
      failedChecks: z.number(),
      lastError: z.string().nullable(),
    }),
  ),
})

export type StatusResponse = z.infer<typeof statusResponseSchema>
export type CurrentStatus = z.infer<typeof currentStatusSchema>
export type Summary = z.infer<typeof summarySchema>
export type HistoryResponse = z.infer<typeof historyResponseSchema>
export type IncidentsResponse = z.infer<typeof incidentsResponseSchema>
export type Incident = IncidentsResponse['incidents'][number]

async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Falha ao buscar ${url}: HTTP ${res.status}`)
  const raw = await res.json()
  return schema.parse(raw)
}

export const api = {
  status: () => getJson('/api/status', statusResponseSchema),
  history: (targetKey: string, hours: number) =>
    getJson(`/api/history/${targetKey}?hours=${hours}`, historyResponseSchema),
  incidents: (hours: number) => getJson(`/api/incidents?hours=${hours}`, incidentsResponseSchema),
}
