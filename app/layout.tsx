import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Discount Tracker",
  description: "Hospital Discount & GRN Tracking",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <nav className="bg-blue-800 text-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-8">
            <span className="font-bold text-lg tracking-wide">Rungta Hospital — Discount Tracker</span>
            <div className="flex gap-6 ml-6">
              <Link href="/" className="hover:text-blue-200 transition-colors">Dashboard</Link>
              <Link href="/manufacturers" className="hover:text-blue-200 transition-colors">Manufacturers</Link>
              <Link href="/items" className="hover:text-blue-200 transition-colors">Item Search</Link>
              <Link href="/upload" className="hover:text-blue-200 transition-colors">Upload GRN</Link>
              <Link href="/audit" className="hover:text-blue-200 transition-colors">Audit Log</Link>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
