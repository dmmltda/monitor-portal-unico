# Monitor · Portal Único Siscomex

Site público com dashboard moderno que monitora a **disponibilidade e a latência** do
[Portal Único de Comércio Exterior](https://portalunico.siscomex.gov.br/) e envia um
**relatório diário por e-mail às 18:00** (America/São_Paulo) para uma lista de contatos.

> O Portal Único exige certificado digital (ICP-Brasil) para consumir as APIs e **não expõe
> endpoint público de health**. Para medir disponibilidade, o monitor faz um `GET` não
> intrusivo nos hosts conhecidos e registra **status HTTP + latência**. Resposta com status
> `< 500` = **no ar**; timeout, erro de rede/TLS ou `>= 500` = **fora**.

## Stack

- **Backend:** Node + TypeScript, [Fastify](https://fastify.dev/), [node-cron](https://github.com/node-cron/node-cron)
- **Banco:** SQLite via [Prisma](https://www.prisma.io/) (volume persistente no Railway)
- **E-mail:** [Resend](https://resend.com/)
- **Frontend:** React + Vite + Tailwind + [Recharts](https://recharts.org/) (dashboard dark)
- **Deploy:** Railway (serviço always-on, um único processo)

## Como funciona

| Componente | O quê |
|-----------|-------|
| Probe (cron `*/2 * * * *`) | A cada 2 min faz `GET` nos alvos, grava `ProbeResult`, abre/fecha `Incident`. |
| Relatório (cron `0 18 * * *`) | Monta o resumo do dia (uptime %, latência média/p95, incidentes) e envia via Resend. |
| API | `/api/status`, `/api/history/:alvo`, `/api/incidents`, e rotas admin (`x-admin-token`). |
| Dashboard | Status ao vivo, gráfico de latência (6h/24h/7d/30d) e histórico de incidentes. |

Os alvos monitorados ficam em [`server/src/probe/targets.ts`](server/src/probe/targets.ts).

## Rodando localmente

```bash
cp .env.example .env        # ajuste as variáveis
npm install
npm run migrate:dev         # cria o SQLite local + aplica o schema
npm run dev                 # server (8080) + dashboard (http://localhost:5173)
```

Variáveis principais (ver [`.env.example`](.env.example)):

- `DATABASE_URL` — SQLite (`file:./prisma/dev.db` local; `file:/data/prod.db` no Railway com volume).
- `RESEND_API_KEY`, `EMAIL_FROM` — envio de e-mail (remetente verificado no Resend).
- `ADMIN_TOKEN` — exigido no header `x-admin-token` para gerenciar contatos e ações.
- `PROBE_CRON`, `DAILY_REPORT_CRON`, `TZ`, `DAILY_REPORT_ENABLED`.

## Gerenciar contatos (admin)

```bash
# Listar
curl -H "x-admin-token: $ADMIN_TOKEN" http://localhost:8080/api/admin/contacts

# Adicionar
curl -X POST -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"email":"fulano@empresa.com","name":"Fulano"}' \
  http://localhost:8080/api/admin/contacts

# Forçar envio do relatório agora / rodar um probe imediato
curl -X POST -H "x-admin-token: $ADMIN_TOKEN" http://localhost:8080/api/admin/send-report
curl -X POST -H "x-admin-token: $ADMIN_TOKEN" http://localhost:8080/api/admin/probe-now

# Pré-visualizar o HTML do relatório no navegador (passe o token no header)
# GET /api/admin/report-preview
```

Também é possível semear contatos no deploy via `SEED_CONTACTS="a@x.com,b@y.com"` + `npm run seed`.

## Deploy no Railway

1. Crie um projeto e conecte este repositório (build/start já definidos em [`railway.json`](railway.json)).
2. Adicione um **Volume** montado em `/data`.
3. Defina as variáveis de ambiente:
   - `DATABASE_URL=file:/data/prod.db`
   - `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_TOKEN`, `TZ=America/Sao_Paulo`, `PUBLIC_BASE_URL=https://<seu-dominio>`
4. O `start` roda `prisma migrate deploy` automaticamente antes de subir o servidor.
5. Healthcheck: `/api/health`.

## Estrutura

```
prisma/schema.prisma         Modelos (ProbeResult, Incident, Contact)
server/src/
  index.ts                   Bootstrap Fastify + static + scheduler
  env.ts                     Validação de env (Zod)
  probe/                     Alvos + execução do probe
  stats/aggregate.ts         Uptime %, latência, p95, histórico, incidentes
  email/                     Relatório diário (build + render + envio Resend)
  cron/scheduler.ts          Agendamento probe + relatório
  routes/                    API pública + admin
web/src/                     Dashboard React (Vite + Tailwind + Recharts)
```
