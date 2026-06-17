import type { CurrentStatus, Summary } from '../lib/api'
import { fmtMs, fmtPct, fmtRelative, uptimeColor } from '../lib/format'

interface Props {
  current: CurrentStatus
  summary24h: Summary | undefined
  selected: boolean
  onSelect: () => void
}

function StatePill({ up }: { up: boolean | null }) {
  const cfg =
    up === null
      ? { label: 'Sem dados', color: '#94a3b8', bg: '#94a3b81a' }
      : up
        ? { label: 'No ar', color: '#22c55e', bg: '#22c55e1a' }
        : { label: 'Fora', color: '#ef4444', bg: '#ef44441a' }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  )
}

export function StatusCard({ current, summary24h, selected, onSelect }: Props) {
  const pct = summary24h?.uptimePct ?? null
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl border p-5 text-left transition ${
        selected
          ? 'border-indigo-500 bg-indigo-500/5'
          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-100">{current.label}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">{current.url}</p>
        </div>
        <StatePill up={current.up} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">Uptime 24h</p>
          <p className="mt-0.5 font-semibold" style={{ color: uptimeColor(pct) }}>
            {fmtPct(pct)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Latência</p>
          <p className="mt-0.5 font-semibold text-slate-200">{fmtMs(current.latencyMs)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Verificado</p>
          <p className="mt-0.5 font-semibold text-slate-200">{fmtRelative(current.lastCheckedAt)}</p>
        </div>
      </div>

      {current.up === false && current.lastError && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{current.lastError}</p>
      )}
    </button>
  )
}
