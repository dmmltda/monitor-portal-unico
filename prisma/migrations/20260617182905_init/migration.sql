-- CreateTable
CREATE TABLE "ProbeResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetKey" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "latencyMs" INTEGER,
    "error" TEXT
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetKey" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "lastError" TEXT,
    "failedChecks" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ProbeResult_targetKey_checkedAt_idx" ON "ProbeResult"("targetKey", "checkedAt");

-- CreateIndex
CREATE INDEX "ProbeResult_checkedAt_idx" ON "ProbeResult"("checkedAt");

-- CreateIndex
CREATE INDEX "Incident_targetKey_startedAt_idx" ON "Incident"("targetKey", "startedAt");

-- CreateIndex
CREATE INDEX "Incident_endedAt_idx" ON "Incident"("endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_email_key" ON "Contact"("email");
