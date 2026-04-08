import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#1f8b8f",
          soft: "#dff4f3",
          deep: "#0f3e44",
        },
        slate: {
          ink: "#13212a",
          mist: "#eef4f6",
          panel: "#f8fbfc",
          night: "#0d171d",
          cloud: "#a2b3bb",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        sans: ["'Inter'", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
