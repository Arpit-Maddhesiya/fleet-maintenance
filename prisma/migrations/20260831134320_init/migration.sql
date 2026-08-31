-- CreateEnum
CREATE TYPE "Role" AS ENUM ('FLEET_MANAGER', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('DUE', 'BOOKED', 'IN_SERVICE', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "odometerReading" INTEGER NOT NULL,
    "dateIntervalDays" INTEGER NOT NULL,
    "mileageIntervalKm" INTEGER NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRecord" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'DUE',
    "scheduledAt" TIMESTAMP(3),
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 7,
    "dueDate" TIMESTAMP(3),
    "dueMileage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianAssignment" (
    "id" TEXT NOT NULL,
    "serviceRecordId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "TechnicianAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OdometerReading" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "reading" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OdometerReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRecordEdit" (
    "id" TEXT NOT NULL,
    "serviceRecordId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "oldStatus" "ServiceStatus",
    "newStatus" "ServiceStatus",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRecordEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "serviceRecordId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverdueAlert" (
    "id" TEXT NOT NULL,
    "serviceRecordId" TEXT NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OverdueAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_registration_key" ON "Vehicle"("registration");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianAssignment_serviceRecordId_technicianId_key" ON "TechnicianAssignment"("serviceRecordId", "technicianId");

-- CreateIndex
CREATE UNIQUE INDEX "OverdueAlert_serviceRecordId_key" ON "OverdueAlert"("serviceRecordId");

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "ServiceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdometerReading" ADD CONSTRAINT "OdometerReading_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecordEdit" ADD CONSTRAINT "ServiceRecordEdit_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "ServiceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecordEdit" ADD CONSTRAINT "ServiceRecordEdit_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "ServiceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverdueAlert" ADD CONSTRAINT "OverdueAlert_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "ServiceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
