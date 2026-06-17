import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { env } from '../env.js'
import { tzDayWindow } from '../lib/time.js'
import { sendDailyReport } from '../email/sendReport.js'
import { runProbeCycle } from '../probe/runProbe.js'
import { debugAuth } from '../probe/authProbe.js'
import { buildDailyReport, renderDailyEmail } from '../email/dailyReport.js'
import { requireAdmin } from './auth.js'

const createContact = z.object({
  email: z.string().email('E-mail invalido').transform((e) => e.toLowerCase()),
  name: z.string().trim().min(1).max(120).optional(),
})

const updateContact = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
})

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  // ---- Contatos ----
  app.get('/api/admin/contacts', async () => {
    const contacts = await prisma.contact.findMany({ orderBy: { createdAt: 'desc' } })
    return { contacts }
  })

  app.post('/api/admin/contacts', async (req, reply) => {
    const parsed = createContact.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados invalidos', details: parsed.error.flatten() })
    }
    const { email, name } = parsed.data
    const existing = await prisma.contact.findUnique({ where: { email } })
    if (existing) {
      return reply.code(409).send({ error: 'Contato ja cadastrado.' })
    }
    const contact = await prisma.contact.create({ data: { email, name } })
    return reply.code(201).send({ contact })
  })

  app.patch('/api/admin/contacts/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateContact.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados invalidos', details: parsed.error.flatten() })
    }
    const exists = await prisma.contact.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'Contato nao encontrado.' })
    const contact = await prisma.contact.update({ where: { id }, data: parsed.data })
    return { contact }
  })

  app.delete('/api/admin/contacts/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const exists = await prisma.contact.findUnique({ where: { id } })
    if (!exists) return reply.code(404).send({ error: 'Contato nao encontrado.' })
    await prisma.contact.delete({ where: { id } })
    return { ok: true }
  })

  // ---- Acoes operacionais ----
  app.post('/api/admin/probe-now', async () => {
    const outcomes = await runProbeCycle()
    return { ok: true, outcomes }
  })

  // Diagnostico do certificado/autenticacao (mostra status + corpo da resposta).
  // ?roleType=XXX testa um perfil diferente sem mudar a env.
  app.get('/api/admin/auth-debug', async (req) => {
    const q = req.query as { roleType?: string }
    return debugAuth(q.roleType)
  })

  app.post('/api/admin/send-report', async (req) => {
    // ?bypassLock=true reenvia mesmo para quem ja recebeu hoje (apenas teste).
    const q = req.query as { bypassLock?: string }
    const bypassLock = q.bypassLock === 'true' || q.bypassLock === '1'
    const result = await sendDailyReport({ force: true, bypassLock })
    return result
  })

  // Quem ja recebeu o relatorio hoje (trava do dia).
  app.get('/api/admin/report-status', async () => {
    const reportDate = tzDayWindow(env.TZ).dateLabel
    const sends = await prisma.dailyReportSend.findMany({
      where: { reportDate },
      orderBy: { sentAt: 'desc' },
    })
    return { reportDate, total: sends.length, sends }
  })

  // Pre-visualizacao do HTML do relatorio do dia (sem enviar).
  app.get('/api/admin/report-preview', async (_req, reply) => {
    const report = await buildDailyReport()
    const { html } = renderDailyEmail(report)
    return reply.type('text/html').send(html)
  })
}
