import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError } from "@/lib/api";
import { Role } from "@/generated/prisma/enums";

interface OdometerRow {
  registrationNumber: string;
  odometerReading: string;
}

// POST /api/vehicles/bulk-odometer — FLEET_MANAGER or ADMIN only
// Accepts a CSV upload (multipart/form-data) with columns
// registrationNumber, odometerReading. Rows are applied one at a time and
// failures are per-row only: a lower-than-current reading or an unknown
// registration rejects that row without rolling back the rows before it.
export async function POST(request: NextRequest) {
  try {
    await requireRole(Role.FLEET_MANAGER);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A CSV file is required (form field 'file')." },
        { status: 400 }
      );
    }

    const csv = await file.text();
    const parsed = Papa.parse<OdometerRow>(csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });
    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { error: "Invalid CSV.", details: parsed.errors },
        { status: 400 }
      );
    }

    const results: {
      row: number;
      registrationNumber: string;
      status: "success" | "rejected";
      reason?: string;
    }[] = [];
    let successCount = 0;
    let rejectedCount = 0;

    // Process row-by-row so a bad row never rolls back the good ones.
    for (let i = 0; i < parsed.data.length; i++) {
      const { registrationNumber, odometerReading } = parsed.data[i];
      const row = i + 2; // 1-based CSV row (header is row 1)

      const registerResult = (status: "success" | "rejected", reason?: string) => {
        results.push({
          row,
          registrationNumber,
          status,
          ...(reason ? { reason } : {}),
        });
        if (status === "success") successCount++;
        else rejectedCount++;
      };

      if (!registrationNumber || odometerReading === undefined || odometerReading === "") {
        registerResult("rejected", `Row ${row}: registrationNumber and odometerReading are required.`);
        continue;
      }
      const reading = Number(odometerReading);
      if (!Number.isInteger(reading) || reading < 0) {
        registerResult(
          "rejected",
          `Row ${row}: odometerReading must be a non-negative whole number.`
        );
        continue;
      }

      const vehicle = await prisma.vehicle.findUnique({
        where: { registrationNumber },
        select: { id: true, registrationNumber: true, currentOdometer: true },
      });
      if (!vehicle) {
        registerResult("rejected", `Vehicle ${registrationNumber} not found.`);
        continue;
      }
      if (reading < vehicle.currentOdometer) {
        registerResult(
          "rejected",
          `New reading ${reading} is lower than current recorded reading ${vehicle.currentOdometer}.`
        );
        continue;
      }

      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { currentOdometer: reading },
      });
      registerResult("success");
    }

    return NextResponse.json({ results, successCount, rejectedCount });
  } catch (error) {
    return handleError(error);
  }
}
