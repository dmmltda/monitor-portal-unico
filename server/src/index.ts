import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { env } from './env.js'
import { startScheduler } from './cron/scheduler.js'
import { adminRoutes } from './routes/contacts.js'
import { publicRoutes } from './routes/public.js'

async function main() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'development' ? 'info' : 'warn' },
  })

  await app.register(publicRoutes)
  await app.register(adminRoutes)

  // Em producao, serve o build do dashboard (Vite -> web/dist).
  const webDist = resolve(process.cwd(), 'web', 'dist')
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/' })
    // SPA fallback: qualquer GET fora de /api devolve o index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html')
      }
      return reply.code(404).send({ error: 'Not found' })
    })
    app.log.info(`Servindo dashboard de ${webDist}`)
  } else {
    app.log.warn(`web/dist nao encontrado (${webDist}); rode "npm run build:web" para servir o dashboard.`)
  }

  startScheduler()

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  console.log(`Monitor Portal Unico ouvindo em http://0.0.0.0:${env.PORT}`)
}

main().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err)
  process.exit(1)
})
