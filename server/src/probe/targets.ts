import { env } from '../env.js'

/**
 * Alvos monitorados no Portal Unico Siscomex.
 *
 * Dois tipos de check:
 *  1) Reachability (REACHABILITY_TARGETS): GET nao intrusivo nos hosts conhecidos,
 *     medindo status HTTP + latencia. Status < 500 = no ar.
 *  2) Autenticado (AUTH_TARGET): POST mTLS em /portal/api/autenticar com o
 *     certificado digital, medindo se a API responde com o token (X-CSRF-Token).
 *     So entra quando um certificado esta configurado (PU_CERT_PFX_*).
 */
export interface ProbeTarget {
  key: string
  label: string
  url: string
  description: string
}

// Ordem define os pills, as barras, o relatorio e o servico aberto por padrao
// (o primeiro = DUIMP).
export const REACHABILITY_TARGETS: ProbeTarget[] = [
  {
    key: 'duimp',
    label: 'DUIMP (Importacao)',
    url: 'https://portalunico.siscomex.gov.br/dimp/api/ext/duimp',
    description: 'API da Declaracao Unica de Importacao (DUIMP).',
  },
  {
    key: 'catalogo',
    label: 'Catalogo de Produtos',
    url: 'https://portalunico.siscomex.gov.br/catp/api/ext/produto',
    description: 'API do Catalogo de Produtos (CATP).',
  },
  {
    key: 'due',
    label: 'DU-E (Exportacao)',
    url: 'https://portalunico.siscomex.gov.br/due/api/ext/due',
    description: 'API da Declaracao Unica de Exportacao (DU-E).',
  },
  {
    key: 'portal-web',
    label: 'Portal Unico (Web)',
    url: 'https://portalunico.siscomex.gov.br/portal/',
    description: 'Aplicacao web do Portal Unico de Comercio Exterior.',
  },
  {
    key: 'api-validacao',
    label: 'API Validacao',
    url: 'https://val.portalunico.siscomex.gov.br/',
    description: 'Ambiente de validacao das APIs do Portal Unico.',
  },
  {
    key: 'docs',
    label: 'Documentacao da API',
    url: 'https://docs.portalunico.siscomex.gov.br/',
    description: 'Portal de documentacao das APIs publicas.',
  },
]

/** Indica se o check autenticado (mTLS) esta habilitado por configuracao. */
export const AUTH_ENABLED = Boolean(env.PU_CERT_PFX_PATH || env.PU_CERT_PFX_BASE64)

const AUTH_HOST = env.PU_AUTH_ENV === 'val' ? 'val.portalunico.siscomex.gov.br' : 'portalunico.siscomex.gov.br'

export const AUTH_TARGET: ProbeTarget = {
  key: 'api-autenticada',
  label: 'API Autenticada (mTLS)',
  url: `https://${AUTH_HOST}/portal/api/autenticar`,
  description: 'Autenticacao real no Portal Unico via certificado digital (recebe o X-CSRF-Token).',
}

/** Todos os alvos exibidos no dashboard (reachability + autenticado, se ativo). */
export const ALL_TARGETS: ProbeTarget[] = AUTH_ENABLED
  ? [...REACHABILITY_TARGETS, AUTH_TARGET]
  : [...REACHABILITY_TARGETS]

export const targetByKey = new Map(ALL_TARGETS.map((t) => [t.key, t]))
