import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  type CurrentStatus,
  type IncidentsResponse,
  type StatusResponse,
  type UptimeResponse,
} from './lib/api'
import { fmtPct, fmtRelative, uptimeColor } from './lib/format'
import { UptimeBars } from './components/UptimeBars'
import { LatencyChart } from './components/LatencyChart'
import { IncidentList } from './components/IncidentList'
import { Brand } from './components/Brand'
import { ServiceSelector } from './components/ServiceSelector'
import { Methodology } from './components/Methodology'
import { AdminPanel } from './components/AdminPanel'

const REFRESH_MS = 30_000

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [uptime, setUptime] = useState<UptimeResponse | null>(null)
  const [incidents, setIncidents] = useState<IncidentsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [hash, setHash] = useState(() => (typeof window !== 'undefined' ? window.location.hash : ''))

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const load = useCallback(async () => {
    try {
      const [s, up, inc] = await Promise.all([api.status(), api.uptime(90), api.incidents(24 * 30)])
      setStatus(s)
      setUptime(up)
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

  const currentByKey = useMemo(
    () => new Map<string, CurrentStatus>((status?.current ?? []).map((c) => [c.key, c])),
    [status],
  )

  const overall = useMemo(() => {
    const list = uptime?.services ?? []
    const withData = list.filter((s) => s.windowUptimePct != null)
    if (withData.length === 0) return null
    return Number((withData.reduce((acc, s) => acc + (s.windowUptimePct ?? 0), 0) / withData.length).toFixed(2))
  }, [uptime])

  const anyDown = status?.current.some((c) => c.up === false) ?? false
  const selectedLabel = status?.current.find((c) => c.key === selected)?.label ?? ''

  if (hash === '#metodologia') return <Methodology />
  if (hash === '#admin') return <AdminPanel />

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
            Disponibilidade · Tempo real
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-50 sm:text-3xl">Monitor · Portal Único Siscomex</h1>
          <p className="mt-1 text-sm text-slate-400">
            Disponibilidade e tempo de resposta dos serviços do Portal Único de Comércio Exterior.
          </p>
          <a
            href="#metodologia"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-400 transition hover:text-indigo-300"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
            </svg>
            Saiba como medimos &amp; transparência
            <span aria-hidden="true">→</span>
          </a>
        </div>
        <Brand />
      </header>

      {/* Faixa de status geral */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 px-5 py-3">
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold"
          style={{
            color: anyDown ? '#ef4444' : uptimeColor(overall),
            background: `${anyDown ? '#ef4444' : uptimeColor(overall)}1a`,
          }}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${anyDown ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`}
          />
          {anyDown ? 'Instabilidade detectada' : 'Todos os serviços operacionais'}
        </div>
        <p className="text-xs text-slate-500">Atualizado {fmtRelative(updatedAt)}</p>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Não foi possível carregar os dados: {error}
        </div>
      )}

      {/* Tempo de resposta do serviço selecionado (gráfico principal) */}
      {selected && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Tempo de resposta por serviço
          </h2>
          <ServiceSelector services={status?.current ?? []} selected={selected} onSelect={setSelected} />
          <LatencyChart targetKey={selected} targetLabel={selectedLabel} />
        </section>
      )}

      {/* Barras de uptime dos últimos 90 dias */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Uptime nos últimos 90 dias
          </h2>
          {overall != null && (
            <span className="text-xs text-slate-500">
              Média:{' '}
              <span className="font-semibold" style={{ color: uptimeColor(overall) }}>
                {fmtPct(overall)}
              </span>
            </span>
          )}
        </div>
        {uptime ? (
          <UptimeBars
            services={uptime.services}
            currentByKey={currentByKey}
            selected={selected}
            onSelect={setSelected}
          />
        ) : (
          !error && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-10 text-center text-sm text-slate-500">
              Carregando serviços…
            </div>
          )
        )}
      </section>

      <section className="mt-6">
        <IncidentList incidents={incidents?.incidents ?? []} />
      </section>

      <footer className="mt-10 border-t border-slate-800 pt-6 text-center text-xs text-slate-600">
        <p>
          <a href="#metodologia" className="text-indigo-400 hover:text-indigo-300">
            Metodologia &amp; transparência
          </a>{' '}
          · como medimos e como você pode conferir os dados.
        </p>
        <p className="mt-2">
          Monitor independente · coleta a cada poucos minutos · relatório diário às 18:00 (America/São_Paulo).
        </p>
        <p className="mt-3">
          <a href="#admin" className="text-slate-500 hover:text-indigo-300">
            Acesso administrativo (login)
          </a>
        </p>
      </footer>
    </div>
  )
}
