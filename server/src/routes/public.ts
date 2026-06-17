import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getCurrentStatus, getHistory, getIncidents, getSummary } from '../stats/aggregate.js'
import { targetByKey } from '../probe/targets.js'

const historyQuery = z.object({
  hours: z.coerce.number().int().positive().max(24 * 90).default(24),
  bucketMinutes: z.coerce.number().int().positive().max(1440).optional(),
})

const incidentsQuery = z.object({
  hours: z.coerce.number().int().positive().max(24 * 365).default(24 * 30),
})

/** Escolhe um tamanho de bucket sensato conforme a janela. */
function defaultBucket(hours: number): number {
  if (hours <= 6) return 5
  if (hours <= 24) return 15
  if (hours <= 24 * 7) return 60
  return 360
}

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/status', async () => {
    const [current, last24h, last7d] = await Promise.all([
      getCurrentStatus(),
      getSummary(24),
      getSummary(24 * 7),
    ])
    return {
      generatedAt: new Date().toISOString(),
      current,
      summary: { last24h, last7d },
    }
  })

  app.get('/api/history/:targetKey', async (req, reply) => {
    const { targetKey } = req.params as { targetKey: string }
    if (!targetByKey.has(targetKey)) {
      return reply.code(404).send({ error: `Alvo desconhecido: ${targetKey}` })
    }
    const parsed = historyQuery.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Parametros invalidos', details: parsed.error.flatten() })
    }
    const { hours } = parsed.data
    const bucketMinutes = parsed.data.bucketMinutes ?? defaultBucket(hours)
    const points = await getHistory(targetKey, hours, bucketMinutes)
    return { targetKey, hours, bucketMinutes, points }
  })

  app.get('/api/incidents', async (req, reply) => {
    const parsed = incidentsQuery.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Parametros invalidos', details: parsed.error.flatten() })
    }
    const incidents = await getIncidents(parsed.data.hours)
    return { incidents }
  })
}
