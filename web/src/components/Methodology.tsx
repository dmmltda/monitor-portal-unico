import { useEffect, useState, type ReactNode } from 'react'
import { api, type CurrentStatus } from '../lib/api'
import { fmtMs, fmtRelative } from '../lib/format'

const base = typeof window !== 'undefined' ? window.location.origin : ''

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-xs text-slate-300">
      <code>{children}</code>
    </pre>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  )
}

export function Methodology() {
  const [services, setServices] = useState<CurrentStatus[]>([])

  useEffect(() => {
    api
      .status()
      .then((s) => setServices(s.current))
      .catch(() => setServices([]))
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8">
        <a href="#" className="text-sm text-indigo-400 hover:text-indigo-300">
          ← Voltar ao painel
        </a>
        <h1 className="mt-3 text-2xl font-bold text-slate-50 sm:text-3xl">Metodologia & Transparência</h1>
        <p className="mt-2 text-sm text-slate-400">
          Como este monitor mede a disponibilidade do Portal Único — e como <strong>você mesmo</strong> pode
          conferir os dados, sem precisar confiar na nossa palavra.
        </p>
      </header>

      <div className="space-y-5">
        <Card title="Como funciona">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              A cada <strong>2 minutos</strong>, o monitor faz uma requisição real a cada serviço do Portal Único e
              registra o <strong>status HTTP</strong> e o <strong>tempo de resposta</strong>.
            </li>
            <li>
              <strong>No ar</strong> = o servidor respondeu com status HTTP abaixo de 500 (inclui 401/403/422, que
              significam "respondeu, mas exige autenticação/dados"). <strong>Fora</strong> = timeout, erro de rede/TLS
              ou status 5xx.
            </li>
            <li>
              O <strong>uptime de 90 dias</strong> é calculado pela duração real dos incidentes (períodos fora),
              não por amostragem — então independe da frequência de coleta.
            </li>
            <li>
              Fuso de referência: <strong>America/São_Paulo</strong>. Coleta contínua, 24/7.
            </li>
          </ul>
        </Card>

        <Card title="Check autenticado (mTLS) — monitoramento real, não só ping">
          <p>
            Além de verificar se cada serviço responde, o monitor faz uma <strong>autenticação real</strong> no
            Portal Único usando um certificado digital <strong>ICP-Brasil (e-CPF, A1)</strong> via mTLS, no endpoint
            oficial <code className="text-slate-200">POST /portal/api/autenticar</code>. Se o Portal devolve o token de
            sessão (<code className="text-slate-200">X-CSRF-Token</code>), a pilha autenticada está saudável. Isso prova
            que não é um simples "ping" externo — é o mesmo fluxo que um sistema integrado usa de verdade.
          </p>
        </Card>

        <Card title="O que monitoramos (ao vivo)">
          <p>
            As URLs reais batidas e a última resposta de cada uma. Atualiza junto com o painel — os números abaixo são
            os mesmos que alimentam o dashboard.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="border-b border-slate-800 py-2 pr-3 font-semibold">Serviço</th>
                  <th className="border-b border-slate-800 py-2 pr-3 font-semibold">URL real</th>
                  <th className="border-b border-slate-800 py-2 pr-3 font-semibold">Último HTTP</th>
                  <th className="border-b border-slate-800 py-2 pr-3 font-semibold">Resp.</th>
                  <th className="border-b border-slate-800 py-2 font-semibold">Verificado</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.key}>
                    <td className="border-b border-slate-800/60 py-2 pr-3 text-slate-200">{s.label}</td>
                    <td className="border-b border-slate-800/60 py-2 pr-3 font-mono text-[11px] text-slate-400">
                      {s.url}
                    </td>
                    <td className="border-b border-slate-800/60 py-2 pr-3">
                      <span style={{ color: s.up ? '#22c55e' : s.up === false ? '#ef4444' : '#64748b' }}>
                        {s.statusCode ?? '—'}
                      </span>
                    </td>
                    <td className="border-b border-slate-800/60 py-2 pr-3 text-slate-400">{fmtMs(s.latencyMs)}</td>
                    <td className="border-b border-slate-800/60 py-2 text-slate-400">{fmtRelative(s.lastCheckedAt)}</td>
                  </tr>
                ))}
                {services.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-500">
                      Carregando…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Confira você mesmo (dados crus)">
          <p>
            Toda a base é exposta em JSON público — sem maquiagem. Rode no terminal e compare com o que o painel mostra:
          </p>
          <p className="font-medium text-slate-200">Status atual de todos os serviços:</p>
          <CodeBlock>{`curl ${base}/api/status`}</CodeBlock>
          <p className="font-medium text-slate-200">Uptime diário dos últimos 90 dias:</p>
          <CodeBlock>{`curl "${base}/api/uptime?days=90"`}</CodeBlock>
          <p className="font-medium text-slate-200">Histórico de incidentes e tempo de resposta:</p>
          <CodeBlock>{`curl ${base}/api/incidents
curl "${base}/api/history/duimp?hours=24"`}</CodeBlock>
          <p className="text-slate-400">
            Abrir esses endereços direto no navegador também funciona — os dados retornados são exatamente os que o
            painel desenha.
          </p>
        </Card>

        <Card title="Relatório diário">
          <p>
            Todo dia às <strong>18:00</strong> (America/São_Paulo), um resumo do dia (uptime, tempo de resposta médio e
            incidentes) é enviado por e-mail aos contatos cadastrados. Há uma trava que garante{' '}
            <strong>no máximo 1 e-mail por dia por destinatário</strong>, mesmo em caso de falha do sistema.
          </p>
        </Card>
      </div>

      <footer className="mt-10 border-t border-slate-800 pt-6 text-center text-xs text-slate-600">
        <a href="#" className="text-indigo-400 hover:text-indigo-300">
          ← Voltar ao painel
        </a>
      </footer>
    </div>
  )
}
