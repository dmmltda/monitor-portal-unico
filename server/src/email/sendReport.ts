import { Resend } from 'resend'
import { env } from '../env.js'
import { prisma } from '../lib/db.js'
import { tzDayWindow } from '../lib/time.js'
import { DAILY_REPORT_KEY, getBoolSetting } from '../lib/settings.js'
import { buildDailyReport, renderDailyEmail } from './dailyReport.js'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

export interface SendResult {
  sent: number
  failed: number
  alreadySent: number
  skipped: boolean
  reason?: string
  reportDate?: string
}

// Guarda em processo: evita duas execucoes simultaneas (cron + envio manual).
let sending = false

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Reserva a trava do dia para um destinatario. true = reservou (pode enviar). */
async function claimSend(reportDate: string, email: string): Promise<boolean> {
  try {
    await prisma.dailyReportSend.create({ data: { reportDate, email } })
    return true
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false
    throw err
  }
}

async function releaseSend(reportDate: string, email: string): Promise<void> {
  await prisma.dailyReportSend.deleteMany({ where: { reportDate, email } })
}

async function logEmail(
  reportDate: string,
  email: string,
  status: 'sent' | 'failed',
  error: string | null,
  providerId: string | null,
): Promise<void> {
  await prisma.emailLog.create({ data: { reportDate, email, status, error, providerId } })
}

/**
 * Monta o relatorio do dia e envia para todos os contatos ativos.
 * - Trava: no maximo 1 e-mail/dia por destinatario (unique no banco).
 * - Throttle (EMAIL_SEND_DELAY_MS) para respeitar o rate limit do Resend.
 * - Registra cada envio em EmailLog (enviado/falhou) para o historico.
 *
 * @param opts.force       ignora o agendamento (envio manual).
 * @param opts.bypassLock  ignora a trava do dia (apenas teste).
 */
export async function sendDailyReport(opts: { force?: boolean; bypassLock?: boolean } = {}): Promise<SendResult> {
  const reportDate = tzDayWindow(env.TZ).dateLabel

  const enabled = (await getBoolSetting(DAILY_REPORT_KEY)) ?? env.DAILY_REPORT_ENABLED
  if (!opts.force && !enabled) {
    return { sent: 0, failed: 0, alreadySent: 0, skipped: true, reason: 'agendamento desativado', reportDate }
  }
  if (!resend) {
    console.warn('[email] RESEND_API_KEY ausente — relatorio nao enviado.')
    return { sent: 0, failed: 0, alreadySent: 0, skipped: true, reason: 'RESEND_API_KEY ausente', reportDate }
  }
  if (sending) {
    return { sent: 0, failed: 0, alreadySent: 0, skipped: true, reason: 'envio ja em andamento', reportDate }
  }

  sending = true
  try {
    const contacts = await prisma.contact.findMany({ where: { active: true } })
    if (contacts.length === 0) {
      return { sent: 0, failed: 0, alreadySent: 0, skipped: true, reason: 'sem contatos ativos', reportDate }
    }

    const report = await buildDailyReport()
    const { subject, html, text } = renderDailyEmail(report)

    let sent = 0
    let failed = 0
    let alreadySent = 0

    for (const contact of contacts) {
      if (!opts.bypassLock) {
        const claimed = await claimSend(reportDate, contact.email)
        if (!claimed) {
          alreadySent += 1
          continue
        }
      }

      try {
        const { data, error } = await resend.emails.send({
          from: env.EMAIL_FROM,
          to: contact.email,
          subject,
          html,
          text,
        })
        if (error) {
          if (!opts.bypassLock) await releaseSend(reportDate, contact.email)
          await logEmail(reportDate, contact.email, 'failed', error.message ?? 'erro Resend', null)
          failed += 1
        } else {
          await logEmail(reportDate, contact.email, 'sent', null, data?.id ?? null)
          sent += 1
        }
      } catch (err) {
        if (!opts.bypassLock) await releaseSend(reportDate, contact.email)
        await logEmail(reportDate, contact.email, 'failed', (err as Error).message, null)
        failed += 1
      }

      if (env.EMAIL_SEND_DELAY_MS > 0) await sleep(env.EMAIL_SEND_DELAY_MS)
    }

    console.log(
      `[email] Relatorio ${reportDate}: ${sent} enviado(s), ${failed} falha(s), ${alreadySent} ja recebido(s), de ${contacts.length} contato(s).`,
    )
    return { sent, failed, alreadySent, skipped: false, reportDate }
  } finally {
    sending = false
  }
}
