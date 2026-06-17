import { useCallback, useEffect, useState, type FormEvent } from 'react'

interface Contact {
  id: string
  email: string
  name: string | null
  active: boolean
  createdAt: string
}

interface Settings {
  dailyReportEnabled: boolean
  dailyReportCron: string
  timezone: string
  emailFrom: string
  authCheckEnabled: boolean
}

interface LogRow {
  id: string
  reportDate: string
  email: string
  sentAt: string
  status: string
  error: string | null
  providerId: string | null
}

const TOKEN_KEY = 'mpu_admin_token'

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
}

const todaySP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export function AdminPanel() {
  const [token, setToken] = useState<string>(() => sessionStorage.getItem(TOKEN_KEY) ?? '')
  const [authed, setAuthed] = useState(false)
  const [pwd, setPwd] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [settings, setSettings] = useState<Settings | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [showBulk, setShowBulk] = useState(false)

  const [logRows, setLogRows] = useState<LogRow[]>([])
  const [logMeta, setLogMeta] = useState({ total: 0, sent: 0, failed: 0 })
  const [logDate, setLogDate] = useState<string>(todaySP())
  const [logOffset, setLogOffset] = useState(0)

  const adminFetch = useCallback(
    async (path: string, init: RequestInit = {}, authToken = token) => {
      const headers: Record<string, string> = { ...(init.headers as Record<string, string>), 'x-admin-token': authToken }
      // Só envia content-type JSON quando há corpo (POST sem corpo + JSON => 400 no Fastify).
      if (init.body) headers['content-type'] = 'application/json'
      const res = await fetch(path, { ...init, headers })
      if (res.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY)
        setAuthed(false)
        throw new Error('Sessão expirada — entre novamente.')
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Erro HTTP ${res.status}`)
      }
      return res.json()
    },
    [token],
  )

  const loadData = useCallback(
    async (authToken = token) => {
      const [s, c] = await Promise.all([
        adminFetch('/api/admin/settings', {}, authToken),
        adminFetch('/api/admin/contacts', {}, authToken),
      ])
      setSettings(s)
      setContacts(c.contacts)
    },
    [adminFetch, token],
  )

  async function loadLog(reset: boolean, dateOverride?: string) {
    const date = dateOverride ?? logDate
    const offset = reset ? 0 : logOffset
    try {
      const qs = new URLSearchParams({ limit: '100', offset: String(offset) })
      if (date) qs.set('reportDate', date)
      const r = await adminFetch(`/api/admin/send-log?${qs.toString()}`)
      setLogMeta({ total: r.total, sent: r.sent, failed: r.failed })
      setLogRows((prev) => (reset ? r.logs : [...prev, ...r.logs]))
      setLogOffset(offset + r.logs.length)
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  useEffect(() => {
    if (!token) return
    loadData(token)
      .then(() => setAuthed(true))
      .catch(() => {
        sessionStorage.removeItem(TOKEN_KEY)
        setToken('')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (authed) void loadLog(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed])

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setLoginError(null)
    try {
      await loadData(pwd)
      sessionStorage.setItem(TOKEN_KEY, pwd)
      setToken(pwd)
      setAuthed(true)
      setPwd('')
    } catch {
      setLoginError('Senha incorreta.')
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken('')
    setAuthed(false)
    setSettings(null)
    setContacts([])
  }

  async function withMsg(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      await loadData()
      setMsg(ok)
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const toggleDaily = () =>
    withMsg(
      () =>
        adminFetch('/api/admin/settings', {
          method: 'PATCH',
          body: JSON.stringify({ dailyReportEnabled: !settings?.dailyReportEnabled }),
        }),
      'Agendamento atualizado.',
    )

  const addContact = () =>
    withMsg(async () => {
      await adminFetch('/api/admin/contacts', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim() || undefined }),
      })
      setNewEmail('')
      setNewName('')
    }, 'Contato adicionado.')

  const toggleActive = (c: Contact) =>
    withMsg(
      () =>
        adminFetch(`/api/admin/contacts/${c.id}`, { method: 'PATCH', body: JSON.stringify({ active: !c.active }) }),
      'Contato atualizado.',
    )

  const removeContact = (c: Contact) =>
    withMsg(() => adminFetch(`/api/admin/contacts/${c.id}`, { method: 'DELETE' }), 'Contato removido.')

  async function bulkImport() {
    if (!bulkText.trim()) return
    setBusy(true)
    setMsg(null)
    try {
      const r = (await adminFetch('/api/admin/contacts/bulk', {
        method: 'POST',
        body: JSON.stringify({ text: bulkText }),
      })) as { found: number; added: number; skipped: number }
      setMsg(`Importação: ${r.added} adicionado(s), ${r.skipped} já existia(m), de ${r.found} e-mail(s) encontrados no texto.`)
      setBulkText('')
      setShowBulk(false)
      await loadData()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function sendNow() {
    setBusy(true)
    setMsg(null)
    try {
      const r = (await adminFetch('/api/admin/send-report', { method: 'POST' })) as { contacts: number }
      setMsg(`Envio iniciado para ${r.contacts} contato(s) ativo(s). O histórico abaixo atualiza em instantes.`)
      setTimeout(() => void loadLog(true, todaySP()), 3000)
      setTimeout(() => void loadLog(true, todaySP()), 12000)
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // ---- Tela de login ----
  if (!authed) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        <a href="#" className="mb-6 text-sm text-indigo-400 hover:text-indigo-300">
          ← Voltar ao painel
        </a>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h1 className="text-xl font-bold text-slate-50">Acesso administrativo</h1>
          <p className="mt-1 text-sm text-slate-400">Gerenciar contatos e agendamento do relatório.</p>
          <form onSubmit={handleLogin} className="mt-5 space-y-3">
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="Senha de administrador"
              autoFocus
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
            {loginError && <p className="text-xs text-red-400">{loginError}</p>}
            <button
              type="submit"
              disabled={busy || !pwd}
              className="w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
            >
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ---- Painel ----
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="flex items-start justify-between">
        <div>
          <a href="#" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Voltar ao painel
          </a>
          <h1 className="mt-2 text-2xl font-bold text-slate-50">Administração</h1>
        </div>
        <button onClick={logout} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200">
          Sair
        </button>
      </div>

      {msg && (
        <div className="mt-4 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200">
          {msg}
        </div>
      )}

      {/* Agendamento */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="font-semibold text-slate-100">Agendamento do relatório</h2>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            Envio diário às <strong className="text-slate-200">18:00</strong> ({settings?.timezone}).{' '}
            {settings?.authCheckEnabled ? 'Check autenticado ativo.' : ''}
            <br />
            Remetente: <span className="text-slate-300">{settings?.emailFrom}</span>
          </div>
          <button
            onClick={toggleDaily}
            disabled={busy}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${settings?.dailyReportEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
            aria-pressed={settings?.dailyReportEnabled}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${settings?.dailyReportEnabled ? 'left-[22px]' : 'left-0.5'}`}
            />
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {settings?.dailyReportEnabled ? 'Agendamento ATIVO — os e-mails saem às 18h.' : 'Agendamento DESATIVADO — nenhum e-mail será enviado.'}
        </p>
        <button
          onClick={sendNow}
          disabled={busy}
          className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-600 disabled:opacity-50"
        >
          Enviar relatório agora (teste)
        </button>
      </section>

      {/* Contatos */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="font-semibold text-slate-100">Contatos ({contacts.length})</h2>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="email@empresa.com"
            className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome (opcional)"
            className="min-w-[140px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
          />
          <button
            onClick={addContact}
            disabled={busy || !newEmail.trim()}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>

        {/* Importação em massa */}
        <div className="mt-3">
          {!showBulk ? (
            <button onClick={() => setShowBulk(true)} className="text-xs text-indigo-400 hover:text-indigo-300">
              + Importar vários de uma vez (colar lista)
            </button>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <p className="mb-2 text-xs text-slate-400">
                Cole a lista (pode ter nomes, vírgulas, ponto e vírgula, quebras de linha — extraio só os e-mails,
                ignoro duplicados):
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={5}
                placeholder="fulano@empresa.com; ciclano@empresa.com; Nome <beltrano@empresa.com> ..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={bulkImport}
                  disabled={busy || !bulkText.trim()}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
                >
                  Importar
                </button>
                <button
                  onClick={() => {
                    setShowBulk(false)
                    setBulkText('')
                  }}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <ul className="mt-4 divide-y divide-slate-800">
          {contacts.length === 0 && <li className="py-4 text-center text-sm text-slate-500">Nenhum contato cadastrado.</li>}
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-200">{c.email}</p>
                {c.name && <p className="truncate text-xs text-slate-500">{c.name}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => toggleActive(c)}
                  disabled={busy}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/40 text-slate-400'}`}
                >
                  {c.active ? 'Ativo' : 'Inativo'}
                </button>
                <button
                  onClick={() => removeContact(c)}
                  disabled={busy}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Histórico de envios */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-100">Histórico de envios</h2>
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={logDate}
              onChange={(e) => {
                setLogDate(e.target.value)
                void loadLog(true, e.target.value)
              }}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
            />
            <button
              onClick={() => {
                setLogDate('')
                void loadLog(true, '')
              }}
              className="text-slate-400 hover:text-slate-200"
            >
              Todos
            </button>
            <button onClick={() => void loadLog(true)} className="text-indigo-400 hover:text-indigo-300">
              Atualizar
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          <span className="font-semibold text-emerald-400">{logMeta.sent} enviados</span> ·{' '}
          <span className="font-semibold text-red-400">{logMeta.failed} falhas</span> · {logMeta.total} no total
          {logDate ? ` (${logDate})` : ' (todos os dias)'}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="border-b border-slate-800 py-2 pr-3 font-semibold">Data / Hora</th>
                <th className="border-b border-slate-800 py-2 pr-3 font-semibold">E-mail</th>
                <th className="border-b border-slate-800 py-2 pr-3 font-semibold">Status</th>
                <th className="border-b border-slate-800 py-2 font-semibold">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {logRows.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap border-b border-slate-800/60 py-2 pr-3 text-slate-400">
                    {fmtDateTime(l.sentAt)}
                  </td>
                  <td className="border-b border-slate-800/60 py-2 pr-3 text-slate-200">{l.email}</td>
                  <td className="border-b border-slate-800/60 py-2 pr-3">
                    <span className={l.status === 'sent' ? 'text-emerald-400' : 'text-red-400'}>
                      {l.status === 'sent' ? 'Enviado' : 'Falhou'}
                    </span>
                  </td>
                  <td className="border-b border-slate-800/60 py-2 text-slate-500">
                    {l.error ?? (l.providerId ? `id ${l.providerId.slice(0, 12)}…` : '—')}
                  </td>
                </tr>
              ))}
              {logRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">
                    Nenhum envio registrado{logDate ? ' neste dia' : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {logRows.length < logMeta.total && (
          <button
            onClick={() => void loadLog(false)}
            disabled={busy}
            className="mt-3 text-sm text-indigo-400 hover:text-indigo-300"
          >
            Carregar mais ({logMeta.total - logRows.length} restantes)
          </button>
        )}
      </section>
    </div>
  )
}
