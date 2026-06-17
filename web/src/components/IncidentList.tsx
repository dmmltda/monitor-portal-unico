import type { Incident } from '../lib/api'
import { fmtDateTime, fmtDuration } from '../lib/format'

interface Props {
  incidents: Incident[]
}

export function IncidentList({ incidents }: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-100">Incidentes (30 dias)</h3>
        <span className="text-xs text-slate-500">{incidents.length} registro(s)</span>
      </div>

      {incidents.length === 0 ? (
        <p className="mt-4 rounded-lg bg-emerald-500/10 px-4 py-6 text-center text-sm text-emerald-300">
          Nenhum incidente registrado no período. Tudo no ar. 🎉
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {incidents.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${i.ongoing ? 'bg-red-500' : 'bg-slate-500'}`}
                  />
                  <span className="font-medium text-slate-200">{i.targetLabel}</span>
                  {i.ongoing && (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                      em aberto
                    </span>
                  )}
                </div>
                {i.lastError && <p className="mt-1 truncate text-xs text-slate-500">{i.lastError}</p>}
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>
                  {fmtDateTime(i.startedAt)}
                  {i.endedAt ? ` → ${fmtDateTime(i.endedAt)}` : ' → agora'}
                </p>
                <p className="font-semibold text-slate-300">{fmtDuration(i.durationMs)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
