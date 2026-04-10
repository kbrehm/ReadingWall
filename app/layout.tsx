import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reading Wall",
  description:
    "A simple summer book club wall for elementary school kids to share books and discuss them safely."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
