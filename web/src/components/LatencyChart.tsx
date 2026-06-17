import { useEffect, useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, type HistoryResponse } from '../lib/api'
import { fmtDateTime, fmtMs } from '../lib/format'

const RANGES = [
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
]

// Faixas de classificacao do tempo de resposta (ms).
const GOOD = 1000 // < 1 s
const BAD = 2500 // > 2,5 s

function classify(ms: number | null): { label: string; color: string } {
  if (ms == null) return { label: 'sem dados', color: '#64748b' }
  if (ms < GOOD) return { label: 'Bom', color: '#22c55e' }
  if (ms < BAD) return { label: 'Médio', color: '#f59e0b' }
  return { label: 'Lento', color: '#ef4444' }
}

function LegendPill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-400">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {children}
    </span>
  )
}

interface Props {
  targetKey: string
  targetLabel: string
}

export function LatencyChart({ targetKey, targetLabel }: Props) {
  const [hours, setHours] = useState(24)
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .history(targetKey, hours)
      .then((res) => {
        if (alive) {
          setData(res)
          setError(null)
        }
      })
      .catch((e: unknown) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [targetKey, hours])

  const points = (data?.points ?? []).map((p) => ({ t: p.t, latency: p.avgLatencyMs }))
  const latencies = points.map((p) => p.latency).filter((v): v is number => v != null)
  const current = latencies.length > 0 ? latencies[latencies.length - 1]! : null
  const cls = classify(current)
  const dataMax = latencies.length > 0 ? Math.max(...latencies) : 0
  const yMax = Math.max(Math.ceil((dataMax * 1.15) / 100) * 100, 1200)

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-100">Tempo de resposta · {targetLabel}</h3>
          <p className="text-xs text-slate-500">
            Quanto o serviço demora para responder. Quanto menor, mais rápido.
          </p>
          {/* Legenda: o que é bom, médio e ruim */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
            <LegendPill color="#22c55e">Bom &lt; 1 s</LegendPill>
            <LegendPill color="#f59e0b">Médio 1–2,5 s</LegendPill>
            <LegendPill color="#ef4444">Lento &gt; 2,5 s</LegendPill>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-800/70 p-1">
            {RANGES.map((r) => (
              <button
                key={r.hours}
                onClick={() => setHours(r.hours)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  hours === r.hours ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {current != null && (
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ color: cls.color, background: `${cls.color}1a` }}
            >
              Agora: {fmtMs(current)} · {cls.label}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 h-64">
        {loading && <div className="flex h-full items-center justify-center text-sm text-slate-500">Carregando…</div>}
        {error && <div className="flex h-full items-center justify-center text-sm text-red-400">{error}</div>}
        {!loading && !error && points.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Ainda sem dados nesta janela.
          </div>
        )}
        {!loading && !error && points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="lat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={cls.color} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={cls.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="t"
                tickFormatter={fmtDateTime}
                tick={{ fill: '#64748b', fontSize: 11 }}
                stroke="#334155"
                minTickGap={40}
              />
              <YAxis domain={[0, yMax]} tick={{ fill: '#64748b', fontSize: 11 }} stroke="#334155" width={48} />
              {/* Linhas de referência das faixas (descartadas se acima da escala) */}
              <ReferenceLine
                y={GOOD}
                stroke="#22c55e"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{ value: 'Bom', position: 'insideTopRight', fill: '#22c55e', fontSize: 10 }}
              />
              <ReferenceLine
                y={BAD}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{ value: 'Lento', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                labelFormatter={(v) => fmtDateTime(String(v))}
                formatter={(value) => [fmtMs(typeof value === 'number' ? value : null), 'Tempo de resposta']}
              />
              <Area
                type="monotone"
                dataKey="latency"
                stroke={cls.color}
                strokeWidth={2}
                fill="url(#lat)"
                connectNulls
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
