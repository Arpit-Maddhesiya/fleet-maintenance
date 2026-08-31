import { NextResponse } from "next/server";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";

export class NotFoundError extends Error {
  constructor(message = "Resource not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export function handleError(error: unknown) {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: error.flatten() },
      { status: 400 }
    );
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return NextResponse.json(
      { error: "A vehicle with this registration number already exists." },
      { status: 409 }
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: "Internal server error." },
    { status: 500 }
  );
}
