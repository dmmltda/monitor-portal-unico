import { Resend } from 'resend'
import { env } from '../env.js'
import { prisma } from '../lib/db.js'
import { buildDailyReport, renderDailyEmail } from './dailyReport.js'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

export interface SendResult {
  sent: number
  skipped: boolean
  reason?: string
}

/**
 * Monta o relatorio do dia e envia para todos os contatos ativos.
 * `force` ignora a flag DAILY_REPORT_ENABLED (usado pelo endpoint de teste).
 */
export async function sendDailyReport(opts: { force?: boolean } = {}): Promise<SendResult> {
  if (!opts.force && !env.DAILY_REPORT_ENABLED) {
    return { sent: 0, skipped: true, reason: 'DAILY_REPORT_ENABLED=false' }
  }
  if (!resend) {
    console.warn('[email] RESEND_API_KEY ausente — relatorio nao enviado.')
    return { sent: 0, skipped: true, reason: 'RESEND_API_KEY ausente' }
  }

  const contacts = await prisma.contact.findMany({ where: { active: true } })
  if (contacts.length === 0) {
    console.warn('[email] Nenhum contato ativo — relatorio nao enviado.')
    return { sent: 0, skipped: true, reason: 'sem contatos ativos' }
  }

  const report = await buildDailyReport()
  const { subject, html, text } = renderDailyEmail(report)

  let sent = 0
  for (const contact of contacts) {
    try {
      const { error } = await resend.emails.send({
        from: env.EMAIL_FROM,
        to: contact.email,
        subject,
        html,
        text,
      })
      if (error) {
        console.error(`[email] Falha ao enviar para ${contact.email}:`, error)
      } else {
        sent += 1
      }
    } catch (err) {
      console.error(`[email] Erro ao enviar para ${contact.email}:`, (err as Error).message)
    }
  }
  console.log(`[email] Relatorio diario enviado para ${sent}/${contacts.length} contatos.`)
  return { sent, skipped: false }
}
