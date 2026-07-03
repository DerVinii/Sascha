import type { Config } from "tailwindcss";

/**
 * Alle Token laufen über CSS-Variablen (RGB-Kanal-Tripel in globals.css),
 * damit der Dunkelmodus per .dark-Klasse umschalten kann. Das
 * rgb(var(--x) / <alpha-value>)-Muster ist Pflicht — sonst brechen alle
 * Opacity-Modifier wie bg-err/10 oder ring-sidebar/20.
 */
function token(name: string): string {
  return `rgb(var(--${name}) / <alpha-value>)`;
}

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: token("c-bg"),
        surface: token("c-surface"),
        ink: token("c-ink"),
        sub: token("c-sub"),
        line: token("c-line"),
        sidebar: token("c-sidebar"),
        "sidebar-soft": token("c-sidebar-soft"),
        brand: token("c-brand"),
        ok: token("c-ok"),
        warn: token("c-warn"),
        err: token("c-err"),
        info: token("c-info"),
        accent: token("c-accent"),
        "accent-hover": token("c-accent-hover"),
        "accent-ink": token("c-accent-ink"),
        "accent-soft": token("c-accent-soft"),
        "accent-faint": token("c-accent-faint"),
        "accent-line": token("c-accent-line"),
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
