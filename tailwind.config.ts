import type { Config } from "tailwindcss";

// Nauli SaKo: ink + matatu yellow, warm "stone" neutrals (tinted toward the yellow),
// one condensed display face for plates, amounts and headings; system sans for everything else.
const config: Config = {
  content: ["./components/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}"],
  future: {
    // :hover styles only on devices that can hover; avoids sticky hover after a tap on phones.
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        ink: "#16130f",
        matatu: { DEFAULT: "#facc15", deep: "#eab308", soft: "#fef6c7" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Arial Narrow", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // One light source, from above; tinted with ink, never pure black.
        lift: "0 1px 2px rgb(22 19 15 / 0.08), 0 10px 28px -12px rgb(22 19 15 / 0.35)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.85)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "draw-check": { to: { strokeDashoffset: "0" } },
        flash: {
          "0%": { backgroundColor: "#dcfce7" },
          "100%": { backgroundColor: "#ffffff" },
        },
      },
      animation: {
        "pop-in": "pop-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "draw-check": "draw-check 520ms cubic-bezier(0.22, 1, 0.36, 1) 180ms forwards",
        flash: "flash 2400ms cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
