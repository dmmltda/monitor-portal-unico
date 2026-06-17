-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "providerId" TEXT
);

-- CreateIndex
CREATE INDEX "EmailLog_sentAt_idx" ON "EmailLog"("sentAt");

-- CreateIndex
CREATE INDEX "EmailLog_reportDate_idx" ON "EmailLog"("reportDate");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");
