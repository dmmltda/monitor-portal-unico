import { Resend } from 'resend'
import { env } from '../env.js'
import { prisma } from '../lib/db.js'
import { tzDayWindow } from '../lib/time.js'
import { DAILY_REPORT_KEY, getBoolSetting } from '../lib/settings.js'
import { buildDailyReport, renderDailyEmail } from './dailyReport.js'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

export interface SendResult {
  sent: number
  alreadySent: number
  skipped: boolean
  reason?: string
  reportDate?: string
}

/** Reserva a trava do dia para um destinatario. true = reservou (pode enviar). */
async function claimSend(reportDate: string, email: string): Promise<boolean> {
  try {
    await prisma.dailyReportSend.create({ data: { reportDate, email } })
    return true
  } catch (err) {
    // P2002 = unique constraint violada => ja foi enviado (ou reservado) hoje.
    if ((err as { code?: string }).code === 'P2002') return false
    throw err
  }
}

/** Libera a trava (usado quando o envio falha, para permitir nova tentativa). */
async function releaseSend(reportDate: string, email: string): Promise<void> {
  await prisma.dailyReportSend.deleteMany({ where: { reportDate, email } })
}

/**
 * Monta o relatorio do dia e envia para todos os contatos ativos.
 * Trava de seguranca: cada destinatario recebe no maximo 1 e-mail por dia
 * (garantido pela unique [reportDate, email] no banco).
 *
 * @param opts.force       ignora DAILY_REPORT_ENABLED (envio manual).
 * @param opts.bypassLock  ignora a trava do dia (apenas para teste deliberado).
 */
export async function sendDailyReport(opts: { force?: boolean; bypassLock?: boolean } = {}): Promise<SendResult> {
  const reportDate = tzDayWindow(env.TZ).dateLabel

  // Agendamento: configuracao do banco (painel admin) tem prioridade sobre a env.
  const enabled = (await getBoolSetting(DAILY_REPORT_KEY)) ?? env.DAILY_REPORT_ENABLED
  if (!opts.force && !enabled) {
    return { sent: 0, alreadySent: 0, skipped: true, reason: 'agendamento desativado', reportDate }
  }
  if (!resend) {
    console.warn('[email] RESEND_API_KEY ausente — relatorio nao enviado.')
    return { sent: 0, alreadySent: 0, skipped: true, reason: 'RESEND_API_KEY ausente', reportDate }
  }

  const contacts = await prisma.contact.findMany({ where: { active: true } })
  if (contacts.length === 0) {
    console.warn('[email] Nenhum contato ativo — relatorio nao enviado.')
    return { sent: 0, alreadySent: 0, skipped: true, reason: 'sem contatos ativos', reportDate }
  }

  const report = await buildDailyReport()
  const { subject, html, text } = renderDailyEmail(report)

  let sent = 0
  let alreadySent = 0

  for (const contact of contacts) {
    // 1) Reserva a trava do dia ANTES de enviar (atomico no banco).
    if (!opts.bypassLock) {
      const claimed = await claimSend(reportDate, contact.email)
      if (!claimed) {
        alreadySent += 1
        continue // ja recebeu hoje — nao reenvia
      }
    }

    // 2) Envia.
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
        if (!opts.bypassLock) await releaseSend(reportDate, contact.email) // libera para nova tentativa
      } else {
        sent += 1
      }
    } catch (err) {
      console.error(`[email] Erro ao enviar para ${contact.email}:`, (err as Error).message)
      if (!opts.bypassLock) await releaseSend(reportDate, contact.email)
    }
  }

  console.log(
    `[email] Relatorio ${reportDate}: ${sent} enviado(s), ${alreadySent} ja recebido(s) hoje, de ${contacts.length} contato(s).`,
  )
  return { sent, alreadySent, skipped: false, reportDate }
}
