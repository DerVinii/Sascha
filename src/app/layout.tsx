import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "SK Kommandozentrale",
  description: "Vertrieb, Sichtbarkeit und CRM für SK – Dozent und Coach",
};

/**
 * Setzt die .dark-Klasse VOR dem ersten Paint aus dem sk_theme-Cookie.
 * Die Klasse wird bewusst NICHT über das React-className von <html>
 * verwaltet: className bleibt konstant, damit React die per classList
 * gesetzte Klasse (Theme-Picker) bei router.refresh() nie überschreibt.
 * Client-gemountete Inline-Skripte führt React nie aus — deshalb muss
 * dieses Skript immer im Server-HTML stehen.
 */
const THEME_BOOT_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )sk_theme=([^;]*)/);var t=m?m[1]:"light";if(t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={inter.variable} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
