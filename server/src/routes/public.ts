import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getCurrentStatus, getHistory, getIncidents, getSummary, getUptimeTimeline } from '../stats/aggregate.js'
import { targetByKey } from '../probe/targets.js'
import { prisma } from '../lib/db.js'

async function unsubscribeByToken(token?: string): Promise<{ ok: boolean; message: string }> {
  if (!token) return { ok: false, message: 'Link invalido.' }
  const contact = await prisma.contact.findUnique({ where: { unsubscribeToken: token } })
  if (!contact) return { ok: false, message: 'Link invalido ou inscricao ja cancelada.' }
  if (contact.active) await prisma.contact.update({ where: { id: contact.id }, data: { active: false } })
  return { ok: true, message: `Pronto! ${contact.email} foi removido da lista e nao recebera mais o relatorio diario.` }
}

function unsubPage(message: string, ok: boolean): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Cancelar inscrição</title></head>
  <body style="margin:0;background:#0b1120;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
    <div style="max-width:480px;margin:0 auto;padding:64px 24px;text-align:center;">
      <div style="font-size:40px;">${ok ? '✅' : '⚠️'}</div>
      <h1 style="font-size:20px;color:#f1f5f9;margin:16px 0 8px;">${ok ? 'Inscrição cancelada' : 'Não foi possível cancelar'}</h1>
      <p style="color:#94a3b8;font-size:14px;">${message}</p>
      <p style="margin-top:24px;"><a href="/" style="color:#818cf8;font-size:14px;">Ir para o monitor →</a></p>
    </div>
  </body></html>`
}

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

  // Cancelamento de inscricao (link do e-mail). Token unico por contato.
  app.get('/api/unsubscribe', async (req, reply) => {
    const { token } = req.query as { token?: string }
    const result = await unsubscribeByToken(token)
    return reply.type('text/html').send(unsubPage(result.message, result.ok))
  })
  // One-click (RFC 8058): cliente de e-mail faz POST direto.
  app.post('/api/unsubscribe', async (req, reply) => {
    const { token } = req.query as { token?: string }
    await unsubscribeByToken(token)
    return reply.code(200).send({ ok: true })
  })

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

  app.get('/api/uptime', async (req, reply) => {
    const parsed = z
      .object({ days: z.coerce.number().int().positive().max(90).default(90) })
      .safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Parametros invalidos', details: parsed.error.flatten() })
    }
    const services = await getUptimeTimeline(parsed.data.days)
    return { days: parsed.data.days, services }
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
