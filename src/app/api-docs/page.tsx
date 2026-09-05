import type { Metadata } from "next";

import { SwaggerDocs } from "./swagger-docs";

export const metadata: Metadata = {
  title: "API Reference — Fleet Maintenance",
  description: "Interactive Swagger UI documentation for the Fleet Maintenance API.",
};

export default function ApiDocsPage() {
  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <SwaggerDocs />
    </div>
  );
}
