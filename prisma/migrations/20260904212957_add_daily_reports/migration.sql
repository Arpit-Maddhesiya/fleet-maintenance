-- CreateEnum
CREATE TYPE "DailyReportType" AS ENUM ('TECHNICIAN', 'FLEET_MANAGER');

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "type" "DailyReportType" NOT NULL,
    "jobsCompleted" INTEGER NOT NULL DEFAULT 0,
    "hoursWorked" INTEGER NOT NULL DEFAULT 0,
    "registrations" TEXT NOT NULL DEFAULT '',
    "bookingsCount" INTEGER NOT NULL DEFAULT 0,
    "inspectionsCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyReport_reportDate_idx" ON "DailyReport"("reportDate");

-- CreateIndex
CREATE INDEX "DailyReport_authorId_idx" ON "DailyReport"("authorId");

-- CreateIndex
CREATE INDEX "DailyReport_type_idx" ON "DailyReport"("type");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_authorId_reportDate_key" ON "DailyReport"("authorId", "reportDate");

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
