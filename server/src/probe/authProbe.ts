import https from 'node:https'
import { readFileSync } from 'node:fs'
import { env } from '../env.js'
import { AUTH_TARGET } from './targets.js'
import type { ProbeOutcome } from './runProbe.js'

let pfxCache: Buffer | null | undefined

/** Carrega o .pfx uma vez (de base64 ou de arquivo). null se indisponivel. */
function loadPfx(): Buffer | null {
  if (pfxCache !== undefined) return pfxCache
  try {
    if (env.PU_CERT_PFX_BASE64) {
      pfxCache = Buffer.from(env.PU_CERT_PFX_BASE64, 'base64')
    } else if (env.PU_CERT_PFX_PATH) {
      pfxCache = readFileSync(env.PU_CERT_PFX_PATH)
    } else {
      pfxCache = null
    }
  } catch (err) {
    console.error('[auth] erro ao carregar o certificado PFX:', (err as Error).message)
    pfxCache = null
  }
  return pfxCache
}

export interface AuthDebug {
  ok: boolean
  statusCode: number | null
  hasToken: boolean
  roleType: string
  authEnv: string
  bodySnippet: string
  error: string | null
}

/**
 * Versao de diagnostico (admin): faz a autenticacao e devolve status + corpo da
 * resposta, para acertar o Role-Type. NAO e persistida nem exibida ao publico.
 */
export function debugAuth(roleTypeOverride?: string): Promise<AuthDebug> {
  const pfx = loadPfx()
  const roleType = roleTypeOverride || env.PU_ROLE_TYPE
  const authEnv = env.PU_AUTH_ENV
  if (!pfx) {
    return Promise.resolve({
      ok: false,
      statusCode: null,
      hasToken: false,
      roleType,
      authEnv,
      bodySnippet: '',
      error: 'Certificado nao carregado',
    })
  }
  const host = env.PU_AUTH_ENV === 'val' ? 'val.portalunico.siscomex.gov.br' : 'portalunico.siscomex.gov.br'
  return new Promise<AuthDebug>((resolve) => {
    try {
      const req = https.request(
        {
          host,
          port: 443,
          path: '/portal/api/autenticar',
          method: 'POST',
          pfx,
          passphrase: env.PU_CERT_PASSPHRASE || undefined,
          headers: { 'Role-Type': roleType, Accept: 'application/json' },
          timeout: env.PROBE_TIMEOUT_MS,
        },
        (res) => {
          let body = ''
          res.on('data', (c) => {
            if (body.length < 600) body += c.toString()
          })
          res.on('end', () => {
            const status = res.statusCode ?? null
            const hasToken = Boolean(res.headers['set-token'] || res.headers['x-csrf-token'])
            resolve({
              ok: hasToken,
              statusCode: status,
              hasToken,
              roleType,
              authEnv,
              bodySnippet: body.slice(0, 600),
              error: null,
            })
          })
        },
      )
      req.on('timeout', () => {
        req.destroy()
        resolve({ ok: false, statusCode: null, hasToken: false, roleType, authEnv, bodySnippet: '', error: 'Timeout' })
      })
      req.on('error', (e) => {
        resolve({ ok: false, statusCode: null, hasToken: false, roleType, authEnv, bodySnippet: '', error: e.message })
      })
      req.end()
    } catch (err) {
      resolve({
        ok: false,
        statusCode: null,
        hasToken: false,
        roleType,
        authEnv,
        bodySnippet: '',
        error: `Falha no certificado: ${(err as Error).message}`,
      })
    }
  })
}

/**
 * Deep check: autentica no Portal Unico via mTLS e considera "no ar" se a API
 * responder com o token (Set-Token / X-CSRF-Token). Sem token, registra o
 * status e o erro para diagnostico.
 */
export function checkAuth(): Promise<ProbeOutcome> {
  const key = AUTH_TARGET.key
  const pfx = loadPfx()
  if (!pfx) {
    return Promise.resolve({
      targetKey: key,
      ok: false,
      statusCode: null,
      latencyMs: null,
      error: 'Certificado nao carregado (verifique PU_CERT_PFX_* e a senha).',
    })
  }

  const host = env.PU_AUTH_ENV === 'val' ? 'val.portalunico.siscomex.gov.br' : 'portalunico.siscomex.gov.br'
  const started = Date.now()

  return new Promise<ProbeOutcome>((resolve) => {
    // O proprio https.request pode lancar de forma sincrona ao carregar o
    // certificado (ex: PKCS#12 legado nao suportado pelo OpenSSL 3). O try/catch
    // garante que isso vire um "fora" normal, sem derrubar o ciclo de probe.
    try {
      const req = https.request(
        {
          host,
          port: 443,
          path: '/portal/api/autenticar',
          method: 'POST',
          pfx,
          passphrase: env.PU_CERT_PASSPHRASE || undefined,
          headers: {
            'Role-Type': env.PU_ROLE_TYPE,
            Accept: 'application/json',
            'User-Agent': 'monitor-portal-unico/1.0 (+disponibilidade)',
          },
          timeout: env.PROBE_TIMEOUT_MS,
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => {
            const latencyMs = Date.now() - started
            const status = res.statusCode ?? null
            const gotToken = Boolean(res.headers['set-token'] || res.headers['x-csrf-token'])
            if (gotToken) {
              resolve({ targetKey: key, ok: true, statusCode: status, latencyMs, error: null })
            } else {
              resolve({
                targetKey: key,
                ok: false,
                statusCode: status,
                latencyMs,
                error: `Sem token na resposta (HTTP ${status ?? '??'})`,
              })
            }
          })
        },
      )
      req.on('timeout', () => {
        req.destroy()
        resolve({
          targetKey: key,
          ok: false,
          statusCode: null,
          latencyMs: Date.now() - started,
          error: `Timeout (${env.PROBE_TIMEOUT_MS}ms)`,
        })
      })
      req.on('error', (err) => {
        resolve({ targetKey: key, ok: false, statusCode: null, latencyMs: Date.now() - started, error: err.message })
      })
      req.end()
    } catch (err) {
      resolve({
        targetKey: key,
        ok: false,
        statusCode: null,
        latencyMs: Date.now() - started,
        error: `Falha no certificado: ${(err as Error).message}`,
      })
    }
  })
}
