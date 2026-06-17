import type { CurrentStatus } from '../lib/api'

interface Props {
  services: CurrentStatus[]
  selected: string | null
  onSelect: (key: string) => void
}

/** Seletor de serviço (pills com status) para escolher o que ver no gráfico. */
export function ServiceSelector({ services, selected, onSelect }: Props) {
  if (services.length === 0) return null
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {services.map((s) => {
        const active = s.key === selected
        const dot = s.up == null ? '#64748b' : s.up ? '#22c55e' : '#ef4444'
        return (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            aria-pressed={active}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
              active
                ? 'border-indigo-500 bg-indigo-500/15 text-indigo-100'
                : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
