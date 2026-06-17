import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Contatos iniciais opcionais via env: SEED_CONTACTS="a@x.com,b@y.com"
async function main() {
  const raw = process.env.SEED_CONTACTS ?? ''
  const emails = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (emails.length === 0) {
    console.log('[seed] Nenhum contato em SEED_CONTACTS. Nada a fazer.')
    return
  }

  for (const email of emails) {
    await prisma.contact.upsert({
      where: { email },
      update: { active: true },
      create: { email },
    })
    console.log(`[seed] Contato garantido: ${email}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
