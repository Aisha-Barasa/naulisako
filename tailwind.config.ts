import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./components/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        matatu: { DEFAULT: "#facc15", dark: "#ca8a04" },
        ink: "#0a0a0a",
      },
    },
  },
  plugins: [],
};
export default config;
