import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
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

  const points = (data?.points ?? []).map((p) => ({
    t: p.t,
    latency: p.avgLatencyMs,
    uptime: p.uptimePct,
  }))

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-100">Tempo de resposta · {targetLabel}</h3>
          <p className="text-xs text-slate-500">
            Quanto o serviço demora para responder, em milissegundos (ms). Quanto menor, mais rápido.
          </p>
        </div>
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
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
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
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} stroke="#334155" width={48} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                labelFormatter={(v) => fmtDateTime(String(v))}
                formatter={(value: number | null) => [fmtMs(value), 'Tempo de resposta']}
              />
              <Area
                type="monotone"
                dataKey="latency"
                stroke="#818cf8"
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
