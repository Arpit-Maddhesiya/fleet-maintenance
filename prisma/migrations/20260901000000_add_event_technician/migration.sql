-- AlterTable
ALTER TABLE "ServiceHistoryEvent" ADD COLUMN "technicianId" TEXT;

-- AddForeignKey
ALTER TABLE "ServiceHistoryEvent" ADD CONSTRAINT "ServiceHistoryEvent_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
