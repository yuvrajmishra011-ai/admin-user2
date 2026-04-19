import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VeriStream — Behavioral Integrity Platform",
  description:
    "Real-time behavioral verification system with live video streaming and structured biometric telemetry.",
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
