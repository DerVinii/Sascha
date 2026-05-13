import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#f8fafc",
        surface: "#ffffff",
        ink: "#0f172a",
        sub: "#64748b",
        line: "#e2e8f0",
        sidebar: "#0f172a",
        "sidebar-soft": "#1e293b",
        brand: "#0f172a",
        ok: "#10b981",
        warn: "#f59e0b",
        err: "#e11d48",
        info: "#0ea5e9",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
