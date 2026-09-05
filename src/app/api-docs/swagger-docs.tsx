"use client";

import { useEffect, useState } from "react";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

/**
 * Swagger UI is a client-only React component, so it lives in its own
 * "use client" module and fetches the spec from the same-origin JSON endpoint.
 * Because the docs page is same-origin, the browser sends the session cookie
 * with every request — "Try it out" works for signed-in users exactly as the
 * rest of the app's API calls do.
 */
export function SwaggerDocs() {
  const [spec, setSpec] = useState<unknown>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/docs", { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load spec (${response.status})`);
        return response.json();
      })
      .then(setSpec)
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white p-8 text-center">
        <div>
          <p className="text-lg font-medium text-slate-900">
            Could not load the API specification.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Try refreshing the page. If it persists, the server may be down.
          </p>
        </div>
      </div>
    );
  }

  if (!spec) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white p-8 text-center">
        <p className="text-sm text-slate-500">Loading API reference…</p>
      </div>
    );
  }

  return (
    <SwaggerUI
      spec={spec as object}
      docExpansion="list"
      defaultModelExpandDepth={2}
      persistAuthorization={false}
      tryItOutEnabled
    />
  );
}
