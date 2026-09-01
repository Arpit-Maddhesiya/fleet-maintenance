/**
 * Typed fetch wrapper for the backend API.
 *
 * Every page/component calls the backend through this module instead of
 * copy-pasting raw fetch calls: it adds credentials, parses JSON, and throws
 * a typed ApiError (status code + server-provided message) on non-2xx so
 * callers can surface the exact server message in a toast or inline error.
 *
 * The backend returns errors as `{ error: string, details?: ... }`, so the
 * message is read from there rather than inventing one client-side.
 */

export class ApiError extends Error {
  readonly status: number;
  /** The parsed JSON error body (e.g. Zod `details` for 400s). */
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * The field-error shape the API returns for Zod validation failures:
 * `{ error: "Validation failed", details: { fieldErrors: { field: [msgs] } } }`.
 */
export interface ApiFieldErrors {
  [field: string]: string[] | undefined;
}

/** Pull field errors out of an ApiError's details, if present. */
export function fieldErrorsOf(error: unknown): ApiFieldErrors | null {
  if (!(error instanceof ApiError)) return null;
  const details = error.details as {
    fieldErrors?: Record<string, string[] | undefined>;
  } | null;
  return details?.fieldErrors ?? null;
}

/** First message for a field, or undefined — the inline-error convention. */
export function firstFieldError(
  errors: ApiFieldErrors | null,
  field: string
): string | undefined {
  return errors?.[field]?.[0];
}

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** JSON body, serialized automatically. */
  body?: unknown;
  /** Send as FormData (multipart) instead of JSON. */
  formData?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", body, formData, headers, signal } = options;

  const isFormData = formData instanceof FormData;

  const response = await fetch(path, {
    method,
    // Same-origin cookies are sent by default in browsers, but being explicit
    // keeps this correct if the API is ever served from another origin.
    credentials: "include",
    signal,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: isFormData ? formData : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  let payload: unknown = null;
  if (isJson) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      (payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : undefined) ?? `Request failed with status ${response.status}.`;

    throw new ApiError(
      response.status,
      message,
      payload && typeof payload === "object" ? payload : undefined
    );
  }

  return payload as T;
}
