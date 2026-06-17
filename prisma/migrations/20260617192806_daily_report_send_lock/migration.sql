-- CreateTable
CREATE TABLE "DailyReportSend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "DailyReportSend_reportDate_idx" ON "DailyReportSend"("reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReportSend_reportDate_email_key" ON "DailyReportSend"("reportDate", "email");
