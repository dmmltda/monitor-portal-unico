import cron from 'node-cron'
import { env } from '../env.js'
import { sendDailyReport } from '../email/sendReport.js'
import { runProbeCycle } from '../probe/runProbe.js'

let probeRunning = false

export function startScheduler(): void {
  if (!cron.validate(env.PROBE_CRON)) {
    throw new Error(`PROBE_CRON invalido: ${env.PROBE_CRON}`)
  }
  if (!cron.validate(env.DAILY_REPORT_CRON)) {
    throw new Error(`DAILY_REPORT_CRON invalido: ${env.DAILY_REPORT_CRON}`)
  }

  // Probe periodico — evita sobreposicao se um ciclo demorar.
  cron.schedule(
    env.PROBE_CRON,
    async () => {
      if (probeRunning) {
        console.warn('[probe] ciclo anterior ainda em execucao — pulando.')
        return
      }
      probeRunning = true
      try {
        await runProbeCycle()
      } catch (err) {
        console.error('[probe] erro no ciclo:', (err as Error).message)
      } finally {
        probeRunning = false
      }
    },
    { timezone: env.TZ },
  )

  // Relatorio diario.
  cron.schedule(
    env.DAILY_REPORT_CRON,
    async () => {
      try {
        await sendDailyReport()
      } catch (err) {
        console.error('[email] erro ao enviar relatorio diario:', (err as Error).message)
      }
    },
    { timezone: env.TZ },
  )

  console.log(
    `[cron] probe="${env.PROBE_CRON}" relatorio="${env.DAILY_REPORT_CRON}" tz=${env.TZ} (envio ${env.DAILY_REPORT_ENABLED ? 'ligado' : 'desligado'})`,
  )

  // Primeira verificacao imediata no boot, para o dashboard nascer com dados.
  void runProbeCycle().catch((err) => console.error('[probe] erro no probe inicial:', (err as Error).message))
}
