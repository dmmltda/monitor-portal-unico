import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { env } from '../env.js'
import { tzDayWindow } from '../lib/time.js'
import { sendDailyReport } from '../email/sendReport.js'
import { runProbeCycle } from '../probe/runProbe.js'
import { debugAuth } from '../probe/authProbe.js'
import { DAILY_REPORT_KEY, getBoolSetting, setBoolSetting } from '../lib/settings.js'
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

  // ---- Sessao / configuracoes ----
  // Tambem serve para validar o login (200 = token correto).
  app.get('/api/admin/settings', async () => {
    const dailyReportEnabled = (await getBoolSetting(DAILY_REPORT_KEY)) ?? env.DAILY_REPORT_ENABLED
    return {
      dailyReportEnabled,
      dailyReportCron: env.DAILY_REPORT_CRON,
      timezone: env.TZ,
      emailFrom: env.EMAIL_FROM,
      authCheckEnabled: Boolean(env.PU_CERT_PFX_PATH || env.PU_CERT_PFX_BASE64),
    }
  })

  app.patch('/api/admin/settings', async (req, reply) => {
    const parsed = z.object({ dailyReportEnabled: z.boolean() }).safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados invalidos', details: parsed.error.flatten() })
    }
    await setBoolSetting(DAILY_REPORT_KEY, parsed.data.dailyReportEnabled)
    return { dailyReportEnabled: parsed.data.dailyReportEnabled }
  })

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
    const contact = await prisma.contact.create({
      data: { email, name, unsubscribeToken: randomBytes(18).toString('base64url') },
    })
    return reply.code(201).send({ contact })
  })

  // Importacao em massa: cola um texto (nomes, ; , quebras de linha) e extrai os e-mails.
  app.post('/api/admin/contacts/bulk', async (req, reply) => {
    const parsed = z.object({ text: z.string().max(200_000) }).safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Texto invalido' })
    }
    const matches = parsed.data.text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []
    const emails = [...new Set(matches.map((e) => e.toLowerCase()))]
    let added = 0
    let skipped = 0
    for (const email of emails) {
      try {
        await prisma.contact.create({ data: { email, unsubscribeToken: randomBytes(18).toString('base64url') } })
        added += 1
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') skipped += 1
        else throw err
      }
    }
    return { found: emails.length, added, skipped }
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
    const contacts = await prisma.contact.count({ where: { active: true } })
    // Assincrono: 300+ envios com throttle levam minutos; nao bloqueia a resposta.
    void sendDailyReport({ force: true, bypassLock }).catch((e) => console.error('[email] envio manual:', e))
    return { started: true, contacts }
  })

  // Historico de envios (auditoria). Filtra por dia e pagina.
  app.get('/api/admin/send-log', async (req, reply) => {
    const parsed = z
      .object({
        reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        status: z.enum(['sent', 'failed']).optional(),
        limit: z.coerce.number().int().positive().max(500).default(100),
        offset: z.coerce.number().int().nonnegative().default(0),
      })
      .safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Parametros invalidos', details: parsed.error.flatten() })
    }
    const { reportDate, status, limit, offset } = parsed.data
    const where = { ...(reportDate ? { reportDate } : {}), ...(status ? { status } : {}) }
    const baseWhere = reportDate ? { reportDate } : {}
    const [logs, total, sent, failed] = await Promise.all([
      prisma.emailLog.findMany({ where, orderBy: { sentAt: 'desc' }, take: limit, skip: offset }),
      prisma.emailLog.count({ where }),
      prisma.emailLog.count({ where: { ...baseWhere, status: 'sent' } }),
      prisma.emailLog.count({ where: { ...baseWhere, status: 'failed' } }),
    ])
    return { total, sent, failed, limit, offset, logs }
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
