import { useState } from 'react'
import type { CurrentStatus, ServiceUptime, UptimeDay } from '../lib/api'
import { fmtDuration, fmtMs, fmtPct, fmtRelative, uptimeColor } from '../lib/format'

interface Props {
  services: ServiceUptime[]
  currentByKey: Map<string, CurrentStatus>
  selected: string | null
  onSelect: (key: string) => void
}

function barColor(day: UptimeDay): string {
  if (!day.monitored || day.uptimePct == null) return '#27313f' // sem dados
  if (day.uptimePct >= 99.5) return '#22c55e'
  if (day.uptimePct >= 95) return '#f59e0b'
  if (day.uptimePct > 0) return '#f97316'
  return '#ef4444'
}

function StatePill({ up }: { up: boolean | null | undefined }) {
  const cfg =
    up == null
      ? { label: 'Sem dados', color: '#94a3b8' }
      : up
        ? { label: 'Operacional', color: '#22c55e' }
        : { label: 'Fora do ar', color: '#ef4444' }
  return (
    <span className="text-sm font-semibold" style={{ color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function fmtDayLabel(date: string): string {
  // date = YYYY-MM-DD
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

function DayTooltip({ day }: { day: UptimeDay }) {
  return (
    <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 w-60 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-left shadow-xl">
      <p className="text-sm font-semibold text-slate-100">{fmtDayLabel(day.date)}</p>
      {!day.monitored || day.uptimePct == null ? (
        <p className="mt-1 text-xs text-slate-500">Sem dados — monitoramento ainda não cobria este dia.</p>
      ) : day.incidents.length === 0 ? (
        <p className="mt-1 text-xs text-emerald-400">
          {fmtPct(day.uptimePct)} de uptime · sem downtime registrado.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs" style={{ color: uptimeColor(day.uptimePct) }}>
            {fmtPct(day.uptimePct)} de uptime · {fmtDuration(day.downtimeMs)} fora
          </p>
          <ul className="mt-2 space-y-1 border-t border-slate-800 pt-2">
            {day.incidents.slice(0, 4).map((i, idx) => (
              <li key={idx} className="text-[11px] text-slate-400">
                {i.lastError ?? 'Indisponível'} · {fmtDuration(i.durationMs)}
              </li>
            ))}
          </ul>
        </>
      )}
      <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-slate-700 bg-slate-950" />
    </div>
  )
}

function ServiceRow({
  service,
  current,
  selected,
  onSelect,
}: {
  service: ServiceUptime
  current: CurrentStatus | undefined
  selected: boolean
  onSelect: () => void
}) {
  const [hover, setHover] = useState<number | null>(null)

  return (
    <div
      className={`rounded-2xl border p-5 transition ${
        selected ? 'border-indigo-500/70 bg-indigo-500/[0.04]' : 'border-slate-800 bg-slate-900/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button onClick={onSelect} className="min-w-0 text-left">
          <h3 className="truncate font-semibold text-slate-100 hover:text-indigo-300">{service.label}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">{service.url}</p>
        </button>
        <div className="text-right">
          <StatePill up={current?.up} />
          {current?.latencyMs != null && current.up && (
            <p className="mt-0.5 text-xs text-slate-500">{fmtMs(current.latencyMs)}</p>
          )}
        </div>
      </div>

      {/* Barras dos 90 dias */}
      <div className="mt-4 flex h-9 items-stretch gap-[2px]">
        {service.days.map((day, idx) => (
          <div
            key={day.date}
            className="relative flex-1"
            onMouseEnter={() => setHover(idx)}
            onMouseLeave={() => setHover((h) => (h === idx ? null : h))}
          >
            <div
              className="h-full w-full rounded-[2px] transition-opacity hover:opacity-80"
              style={{ background: barColor(day) }}
            />
            {hover === idx && <DayTooltip day={day} />}
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{service.days.length} dias atrás</span>
        <span className="font-medium" style={{ color: uptimeColor(service.windowUptimePct) }}>
          {fmtPct(service.windowUptimePct)} de uptime
        </span>
        <span>Hoje</span>
      </div>

      {current?.up === false && current.lastError && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {current.lastError} · verificado {fmtRelative(current.lastCheckedAt)}
        </p>
      )}
    </div>
  )
}

export function UptimeBars({ services, currentByKey, selected, onSelect }: Props) {
  return (
    <div className="space-y-4">
      {services.map((s) => (
        <ServiceRow
          key={s.key}
          service={s}
          current={currentByKey.get(s.key)}
          selected={selected === s.key}
          onSelect={() => onSelect(s.key)}
        />
      ))}
    </div>
  )
}
