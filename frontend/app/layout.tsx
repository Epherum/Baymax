import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import LenisProvider from "./lenis-provider";
import { Sidebar } from "../components/Sidebar";
import PageTransition from "../components/PageTransition";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Baymax",
  description: "Local-first life mirror",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable}`}>
        <LenisProvider>
          <div className="layout">
            <Sidebar />
            <main className="main-content">
              <PageTransition>
                {children}
              </PageTransition>
            </main>
          </div>
        </LenisProvider>
      </body>
    </html>
  );
}
