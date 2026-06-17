import { prisma } from './db.js'

export const DAILY_REPORT_KEY = 'daily_report_enabled'

/** Le uma configuracao booleana. Retorna null se nunca foi definida. */
export async function getBoolSetting(key: string): Promise<boolean | null> {
  const s = await prisma.setting.findUnique({ where: { key } })
  if (!s) return null
  return s.value === 'true'
}

/** Define uma configuracao booleana (upsert). */
export async function setBoolSetting(key: string, value: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  })
}
