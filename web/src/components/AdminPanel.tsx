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

const TOKEN_KEY = 'mpu_admin_token'

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

  const sendNow = () =>
    withMsg(async () => {
      const r = (await adminFetch('/api/admin/send-report', { method: 'POST' })) as {
        sent: number
        alreadySent: number
      }
      setMsg(`Relatório: ${r.sent} enviado(s), ${r.alreadySent} já recebido(s) hoje.`)
    }, 'Relatório processado.')

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
    </div>
  )
}
