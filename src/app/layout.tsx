import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fleet Maintenance",
  description: "Fleet maintenance management system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}