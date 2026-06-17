import { env } from '../env.js'
import { prisma } from '../lib/db.js'
import { formatDateBR, formatDuration, formatTimeBR, tzDayWindow, type DayWindow } from '../lib/time.js'
import { ALL_TARGETS, targetByKey } from '../probe/targets.js'

interface TargetDayStat {
  key: string
  label: string
  totalChecks: number
  uptimePct: number | null
  avgLatencyMs: number | null
  p95LatencyMs: number | null
  incidents: number
  downtimeMs: number
}

interface IncidentDay {
  targetLabel: string
  startedAt: Date
  endedAt: Date | null
  durationMs: number
  lastError: string | null
}

export interface DailyReport {
  window: DayWindow
  dateBR: string
  overallUptimePct: number | null
  totalChecks: number
  perTarget: TargetDayStat[]
  incidents: IncidentDay[]
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

/** Monta as estatisticas do dia (no fuso configurado). */
export async function buildDailyReport(ref: Date = new Date()): Promise<DailyReport> {
  const window = tzDayWindow(env.TZ, ref)
  const { start, end } = window

  let totalChecksAll = 0
  let upChecksAll = 0

  const perTarget: TargetDayStat[] = await Promise.all(
    ALL_TARGETS.map(async (t) => {
      const rows = await prisma.probeResult.findMany({
        where: { targetKey: t.key, checkedAt: { gte: start, lt: end } },
        select: { ok: true, latencyMs: true },
      })
      const total = rows.length
      const up = rows.filter((r) => r.ok).length
      totalChecksAll += total
      upChecksAll += up
      const latencies = rows
        .filter((r) => r.ok && r.latencyMs != null)
        .map((r) => r.latencyMs as number)

      const incidentsRaw = await prisma.incident.findMany({
        where: {
          targetKey: t.key,
          startedAt: { lt: end },
          OR: [{ endedAt: null }, { endedAt: { gte: start } }],
        },
      })
      let downtimeMs = 0
      for (const inc of incidentsRaw) {
        const s = Math.max(inc.startedAt.getTime(), start.getTime())
        const e = Math.min((inc.endedAt ?? new Date()).getTime(), end.getTime())
        downtimeMs += Math.max(0, e - s)
      }

      return {
        key: t.key,
        label: t.label,
        totalChecks: total,
        uptimePct: total > 0 ? Number(((up / total) * 100).toFixed(2)) : null,
        avgLatencyMs: avg(latencies),
        p95LatencyMs: percentile(latencies, 95),
        incidents: incidentsRaw.length,
        downtimeMs,
      }
    }),
  )

  const incidentsRows = await prisma.incident.findMany({
    where: {
      startedAt: { lt: end },
      OR: [{ endedAt: null }, { endedAt: { gte: start } }],
    },
    orderBy: { startedAt: 'desc' },
  })
  const incidents: IncidentDay[] = incidentsRows.map((i) => ({
    targetLabel: targetByKey.get(i.targetKey)?.label ?? i.targetKey,
    startedAt: i.startedAt,
    endedAt: i.endedAt,
    durationMs: (i.endedAt ?? new Date()).getTime() - i.startedAt.getTime(),
    lastError: i.lastError,
  }))

  return {
    window,
    dateBR: formatDateBR(start, env.TZ),
    overallUptimePct: totalChecksAll > 0 ? Number(((upChecksAll / totalChecksAll) * 100).toFixed(2)) : null,
    totalChecks: totalChecksAll,
    perTarget,
    incidents,
  }
}

function fmtPct(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(2)}%`
}
function fmtMs(v: number | null): string {
  return v == null ? '—' : `${v} ms`
}

/** Gera o assunto e o HTML do relatorio. `unsubscribeUrl` adiciona o link de cancelamento. */
export function renderDailyEmail(
  report: DailyReport,
  unsubscribeUrl?: string,
): { subject: string; html: string; text: string } {
  const overall = report.overallUptimePct
  const statusColor = overall == null ? '#64748b' : overall >= 99.5 ? '#16a34a' : overall >= 95 ? '#d97706' : '#dc2626'
  const statusWord = overall == null ? 'Sem dados' : overall >= 99.5 ? 'Estavel' : overall >= 95 ? 'Instavel' : 'Critico'

  const rows = report.perTarget
    .map((t) => {
      const upColor = t.uptimePct == null ? '#64748b' : t.uptimePct >= 99.5 ? '#16a34a' : t.uptimePct >= 95 ? '#d97706' : '#dc2626'
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;">${t.label}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:right;font-weight:600;color:${upColor};">${fmtPct(t.uptimePct)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:right;color:#94a3b8;">${fmtMs(t.avgLatencyMs)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:right;color:#94a3b8;">${fmtMs(t.p95LatencyMs)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:right;color:${t.incidents > 0 ? '#f87171' : '#94a3b8'};">${t.incidents}${t.downtimeMs > 0 ? ` (${formatDuration(t.downtimeMs)})` : ''}</td>
      </tr>`
    })
    .join('')

  const incidentsBlock =
    report.incidents.length === 0
      ? `<p style="color:#16a34a;margin:8px 0 0;">Nenhum incidente registrado no dia. 🎉</p>`
      : `<ul style="margin:8px 0 0;padding-left:18px;color:#cbd5e1;">${report.incidents
          .map((i) => {
            const ini = formatTimeBR(i.startedAt, env.TZ)
            const fim = i.endedAt ? formatTimeBR(i.endedAt, env.TZ) : 'em aberto'
            return `<li style="margin-bottom:6px;"><strong style="color:#e2e8f0;">${i.targetLabel}</strong> — ${ini} → ${fim} (${formatDuration(i.durationMs)})${i.lastError ? ` · ${i.lastError}` : ''}</li>`
          })
          .join('')}</ul>`

  const link = env.PUBLIC_BASE_URL
    ? `<p style="margin:24px 0 0;"><a href="${env.PUBLIC_BASE_URL}" style="color:#818cf8;">Abrir o dashboard ao vivo →</a></p>`
    : ''

  const html = `<!doctype html><html><body style="margin:0;background:#0f172a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:28px;">
    <div style="background:#1e293b;border-radius:14px;padding:24px;border:1px solid #334155;">
      <p style="margin:0;color:#94a3b8;font-size:13px;letter-spacing:.04em;text-transform:uppercase;">Monitor Portal Unico</p>
      <h1 style="margin:6px 0 0;color:#f1f5f9;font-size:22px;">Relatorio diario · ${report.dateBR}</h1>
      <div style="margin:18px 0;display:inline-block;padding:8px 16px;border-radius:999px;background:${statusColor}22;border:1px solid ${statusColor};">
        <span style="color:${statusColor};font-weight:700;font-size:15px;">${statusWord} · ${fmtPct(overall)} uptime</span>
      </div>
      <p style="color:#94a3b8;margin:0 0 18px;font-size:14px;">${report.totalChecks} verificacoes no dia.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 12px;color:#64748b;font-weight:600;border-bottom:1px solid #334155;">Servico</th>
            <th style="text-align:right;padding:8px 12px;color:#64748b;font-weight:600;border-bottom:1px solid #334155;">Uptime</th>
            <th style="text-align:right;padding:8px 12px;color:#64748b;font-weight:600;border-bottom:1px solid #334155;">Lat. media</th>
            <th style="text-align:right;padding:8px 12px;color:#64748b;font-weight:600;border-bottom:1px solid #334155;">p95</th>
            <th style="text-align:right;padding:8px 12px;color:#64748b;font-weight:600;border-bottom:1px solid #334155;">Incidentes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <h2 style="color:#f1f5f9;font-size:16px;margin:24px 0 0;">Incidentes</h2>
      ${incidentsBlock}
      ${link}
    </div>
    <p style="color:#475569;font-size:12px;text-align:center;margin:18px 0 0;">Voce recebe este e-mail por estar na lista de contatos do Monitor Portal Unico.${
      unsubscribeUrl
        ? `<br/>Nao quer mais receber? <a href="${unsubscribeUrl}" style="color:#64748b;text-decoration:underline;">Cancelar inscricao</a>.`
        : ''
    }</p>
    <p style="color:#3f4a5c;font-size:11px;text-align:center;margin:10px 0 0;line-height:1.6;">Seus dados (nome e e-mail) sao tratados exclusivamente para o envio deste relatorio de disponibilidade, em conformidade com a Lei Geral de Protecao de Dados (LGPD &mdash; Lei n&ordm; 13.709/2018). A base legal e o legitimo interesse, e voce pode cancelar o recebimento a qualquer momento pelo link acima.</p>
  </div>
</body></html>`

  const text = [
    `Monitor Portal Unico — Relatorio diario ${report.dateBR}`,
    `Status geral: ${statusWord} (${fmtPct(overall)} uptime, ${report.totalChecks} verificacoes)`,
    '',
    ...report.perTarget.map(
      (t) => `- ${t.label}: ${fmtPct(t.uptimePct)} uptime, media ${fmtMs(t.avgLatencyMs)}, p95 ${fmtMs(t.p95LatencyMs)}, ${t.incidents} incidente(s)`,
    ),
    '',
    report.incidents.length === 0
      ? 'Nenhum incidente no dia.'
      : `Incidentes:\n${report.incidents
          .map((i) => `  * ${i.targetLabel}: ${formatTimeBR(i.startedAt, env.TZ)} -> ${i.endedAt ? formatTimeBR(i.endedAt, env.TZ) : 'em aberto'} (${formatDuration(i.durationMs)})`)
          .join('\n')}`,
    '',
    'Seus dados (nome e e-mail) sao tratados exclusivamente para o envio deste relatorio, em conformidade com a LGPD (Lei 13.709/2018). Base legal: legitimo interesse. Cancele quando quiser no link abaixo.',
    unsubscribeUrl ? `Cancelar inscricao: ${unsubscribeUrl}` : '',
  ].join('\n')

  const subject = `[Portal Unico] ${report.dateBR} — ${statusWord}, ${fmtPct(overall)} uptime`
  return { subject, html, text }
}
