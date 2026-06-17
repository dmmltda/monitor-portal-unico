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
  // Intervalo entre envios de e-mail (ms) para respeitar o rate limit do Resend.
  EMAIL_SEND_DELAY_MS: z.coerce.number().int().nonnegative().default(600),

  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Monitor Portal Unico <onboarding@resend.dev>'),

  // ----- Check autenticado (mTLS) no Portal Unico — opcional -----
  // Forneca o .pfx por caminho de arquivo (local) OU base64 (Railway).
  PU_CERT_PFX_PATH: z.string().optional().default(''),
  PU_CERT_PFX_BASE64: z.string().optional().default(''),
  PU_CERT_PASSPHRASE: z.string().optional().default(''),
  // Perfil de acesso enviado no header Role-Type (ex: IMPEXP, DESPACHANTE, TRANSPORTADOR).
  PU_ROLE_TYPE: z.string().default('IMPEXP'),
  // Ambiente do PU usado no check autenticado: prod | val
  PU_AUTH_ENV: z.enum(['prod', 'val']).default('prod'),

  ADMIN_TOKEN: z.string().default(''),
  PUBLIC_BASE_URL: z.string().optional().default(''),

  NODE_ENV: z.string().default('development'),
})

export const env = envSchema.parse(process.env)
export type Env = z.infer<typeof envSchema>
