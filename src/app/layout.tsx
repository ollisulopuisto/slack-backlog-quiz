import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slack Backlog Quiz",
  description:
    "Interaktiivinen visa oman Slack-arkiston pohjalta.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fi">
      <body>{children}</body>
    </html>
  );
}
