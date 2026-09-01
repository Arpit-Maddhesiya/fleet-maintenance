import { redirect } from "next/navigation";

// The dashboard is the landing page after login; an unauthenticated visitor
// hits this, gets sent to /dashboard, and the (app) layout bounces them to
// /login with a callback URL.
export default function Home() {
  redirect("/dashboard");
}
