-- AlterTable: token de cancelamento por contato
ALTER TABLE "Contact" ADD COLUMN "unsubscribeToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Contact_unsubscribeToken_key" ON "Contact"("unsubscribeToken");
