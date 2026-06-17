import { env } from '../env.js'
import { prisma } from '../lib/db.js'
import { TARGETS, type ProbeTarget } from './targets.js'

export interface ProbeOutcome {
  targetKey: string
  ok: boolean
  statusCode: number | null
  latencyMs: number | null
  error: string | null
}

/** Faz uma unica requisicao GET ao alvo e classifica como no ar / fora. */
export async function checkTarget(target: ProbeTarget): Promise<ProbeOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.PROBE_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const res = await fetch(target.url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'monitor-portal-unico/1.0 (+disponibilidade)',
        Accept: '*/*',
      },
    })
    const latencyMs = Date.now() - startedAt
    // No ar = o servidor respondeu com status < 500.
    const ok = res.status < 500
    return {
      targetKey: target.key,
      ok,
      statusCode: res.status,
      latencyMs,
      error: ok ? null : `HTTP ${res.status}`,
    }
  } catch (err) {
    const latencyMs = Date.now() - startedAt
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return {
      targetKey: target.key,
      ok: false,
      statusCode: null,
      latencyMs,
      error: isAbort ? `Timeout (${env.PROBE_TIMEOUT_MS}ms)` : (err as Error).message,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Persiste o resultado e mantem o estado de incidentes:
 * - alvo no ar -> fora: abre incidente.
 * - alvo fora -> fora: incrementa contador do incidente aberto.
 * - alvo fora -> no ar: fecha incidente aberto.
 */
async function persistOutcome(outcome: ProbeOutcome): Promise<void> {
  await prisma.probeResult.create({
    data: {
      targetKey: outcome.targetKey,
      ok: outcome.ok,
      statusCode: outcome.statusCode,
      latencyMs: outcome.latencyMs,
      error: outcome.error,
    },
  })

  const openIncident = await prisma.incident.findFirst({
    where: { targetKey: outcome.targetKey, endedAt: null },
    orderBy: { startedAt: 'desc' },
  })

  if (!outcome.ok) {
    if (openIncident) {
      await prisma.incident.update({
        where: { id: openIncident.id },
        data: { failedChecks: { increment: 1 }, lastError: outcome.error },
      })
    } else {
      await prisma.incident.create({
        data: { targetKey: outcome.targetKey, lastError: outcome.error },
      })
    }
  } else if (openIncident) {
    await prisma.incident.update({
      where: { id: openIncident.id },
      data: { endedAt: new Date() },
    })
  }
}

/** Executa o probe de todos os alvos em paralelo e persiste tudo. */
export async function runProbeCycle(): Promise<ProbeOutcome[]> {
  const outcomes = await Promise.all(TARGETS.map(checkTarget))
  for (const outcome of outcomes) {
    await persistOutcome(outcome)
  }
  const down = outcomes.filter((o) => !o.ok)
  if (down.length > 0) {
    console.warn(
      `[probe] ${down.length}/${outcomes.length} fora: ${down.map((d) => `${d.targetKey}(${d.error})`).join(', ')}`,
    )
  } else {
    console.log(`[probe] ${outcomes.length}/${outcomes.length} no ar`)
  }
  return outcomes
}
