import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}", "./{admin,expert,student,shared}/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
