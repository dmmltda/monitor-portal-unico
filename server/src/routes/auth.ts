import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../env.js'

/** preHandler que exige o header x-admin-token igual ao ADMIN_TOKEN. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!env.ADMIN_TOKEN) {
    return reply.code(503).send({ error: 'ADMIN_TOKEN nao configurado no servidor.' })
  }
  const token = req.headers['x-admin-token']
  if (token !== env.ADMIN_TOKEN) {
    return reply.code(401).send({ error: 'Nao autorizado.' })
  }
}
