import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WhatsApp Sender",
  description: "Mass messaging dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}