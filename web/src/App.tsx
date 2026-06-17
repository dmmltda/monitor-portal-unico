import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type IncidentsResponse, type StatusResponse } from './lib/api'
import { fmtPct, fmtRelative, uptimeColor } from './lib/format'
import { StatusCard } from './components/StatusCard'
import { LatencyChart } from './components/LatencyChart'
import { IncidentList } from './components/IncidentList'

const REFRESH_MS = 30_000

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [incidents, setIncidents] = useState<IncidentsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, inc] = await Promise.all([api.status(), api.incidents(24 * 30)])
      setStatus(s)
      setIncidents(inc)
      setUpdatedAt(s.generatedAt)
      setError(null)
      setSelected((prev) => prev ?? s.current[0]?.key ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const overall = useMemo(() => {
    const list = status?.summary.last24h ?? []
    const withData = list.filter((s) => s.uptimePct != null)
    if (withData.length === 0) return null
    return Number((withData.reduce((acc, s) => acc + (s.uptimePct ?? 0), 0) / withData.length).toFixed(2))
  }, [status])

  const anyDown = status?.current.some((c) => c.up === false) ?? false
  const summaryByKey = useMemo(
    () => new Map((status?.summary.last24h ?? []).map((s) => [s.key, s])),
    [status],
  )
  const selectedLabel = status?.current.find((c) => c.key === selected)?.label ?? ''

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
            Disponibilidade · Tempo real
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-50 sm:text-3xl">Monitor · Portal Único Siscomex</h1>
          <p className="mt-1 text-sm text-slate-400">
            Latência e disponibilidade dos serviços do Portal Único de Comércio Exterior.
          </p>
        </div>
        <div className="text-right">
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold"
            style={{
              color: anyDown ? '#ef4444' : uptimeColor(overall),
              background: `${anyDown ? '#ef4444' : uptimeColor(overall)}1a`,
            }}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${anyDown ? 'bg-red-500' : 'bg-emerald-500'} ${anyDown ? '' : 'animate-pulse'}`} />
            {anyDown ? 'Instabilidade detectada' : 'Todos os serviços no ar'}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Uptime médio 24h: <span style={{ color: uptimeColor(overall) }}>{fmtPct(overall)}</span> · atualizado{' '}
            {fmtRelative(updatedAt)}
          </p>
        </div>
      </header>

      {error && (
        <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Não foi possível carregar os dados: {error}
        </div>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {(status?.current ?? []).map((c) => (
          <StatusCard
            key={c.key}
            current={c}
            summary24h={summaryByKey.get(c.key)}
            selected={selected === c.key}
            onSelect={() => setSelected(c.key)}
          />
        ))}
        {!status && !error && (
          <div className="col-span-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-10 text-center text-sm text-slate-500">
            Carregando serviços…
          </div>
        )}
      </section>

      {selected && (
        <section className="mt-6">
          <LatencyChart targetKey={selected} targetLabel={selectedLabel} />
        </section>
      )}

      <section className="mt-6">
        <IncidentList incidents={incidents?.incidents ?? []} />
      </section>

      <footer className="mt-10 border-t border-slate-800 pt-6 text-center text-xs text-slate-600">
        Monitor independente · dados coletados a cada poucos minutos · relatório diário enviado às 18:00 (America/São_Paulo).
      </footer>
    </div>
  )
}
