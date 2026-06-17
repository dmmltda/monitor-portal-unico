import { existsSync } from 'node:fs'
import { z } from 'zod'

// Em desenvolvimento, carrega o .env local. No Railway as variaveis vem da
// plataforma e este arquivo nao existe — por isso o guard.
if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env')
  } catch {
    // ignora: .env ausente ou ilegivel
  }
}

const boolish = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())))

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL e obrigatorio'),
  PORT: z.coerce.number().int().positive().default(8080),
  TZ: z.string().default('America/Sao_Paulo'),

  PROBE_CRON: z.string().default('*/2 * * * *'),
  PROBE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  DAILY_REPORT_CRON: z.string().default('0 18 * * *'),
  DAILY_REPORT_ENABLED: boolish(true),

  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Monitor Portal Unico <onboarding@resend.dev>'),

  ADMIN_TOKEN: z.string().default(''),
  PUBLIC_BASE_URL: z.string().optional().default(''),

  NODE_ENV: z.string().default('development'),
})

export const env = envSchema.parse(process.env)
export type Env = z.infer<typeof envSchema>
