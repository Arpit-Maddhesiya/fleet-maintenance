import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/openapi";

// GET /api/docs — the raw OpenAPI 3.0 document backing the Swagger UI page at
// /api-docs. Served as a plain JSON response so any tooling can consume it.
export function GET() {
  return NextResponse.json(openApiSpec);
}
