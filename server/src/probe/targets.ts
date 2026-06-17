/**
 * Alvos monitorados no Portal Unico Siscomex.
 *
 * O Portal Unico exige certificado digital (ICP-Brasil) para consumir os
 * dados das APIs, e NAO expoe um endpoint publico de health/status. Para um
 * monitor de DISPONIBILIDADE isso nao e necessario: fazemos um GET nao
 * intrusivo nos hosts conhecidos e medimos o tempo de resposta + status HTTP.
 *
 * Regra de "no ar": recebemos uma resposta HTTP com status < 500.
 * Ou seja, 200/301/401/403/404 contam como NO AR (o servico respondeu).
 * Timeout, erro de rede/TLS ou status >= 500 contam como FORA.
 */
export interface ProbeTarget {
  /** Chave estavel usada no banco e na API. */
  key: string
  /** Rotulo exibido no dashboard. */
  label: string
  /** URL alvo (GET). */
  url: string
  /** Descricao curta do que representa. */
  description: string
}

export const TARGETS: ProbeTarget[] = [
  {
    key: 'portal-web',
    label: 'Portal Unico (Web)',
    url: 'https://portalunico.siscomex.gov.br/portal/',
    description: 'Aplicacao web do Portal Unico de Comercio Exterior.',
  },
  {
    key: 'api-producao',
    label: 'API Producao',
    url: 'https://portalunico.siscomex.gov.br/',
    description: 'Gateway de producao das APIs do Portal Unico.',
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

export const targetByKey = new Map(TARGETS.map((t) => [t.key, t]))
