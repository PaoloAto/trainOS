import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#06080D",
          card: "#0C1018",
          elevated: "#101620",
        },
        border: {
          DEFAULT: "#182232",
        },
        green: {
          DEFAULT: "#1FE87A",
          muted: "rgba(31, 232, 122, 0.12)",
          glow: "rgba(31, 232, 122, 0.32)",
        },
        amber: {
          DEFAULT: "#F59E0B",
          muted: "rgba(245, 158, 11, 0.12)",
        },
        indigo: {
          DEFAULT: "#6366F1",
          muted: "rgba(99, 102, 241, 0.12)",
        },
        red: {
          DEFAULT: "#EF4444",
          muted: "rgba(239, 68, 68, 0.12)",
        },
        text: {
          primary: "#ECF0F5",
          secondary: "#9CA3AF",
          muted: "#556070",
        },
      },
      fontFamily: {
        sans: ["Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Space Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "1.25rem",
        sheet: "1.75rem",
      },
      boxShadow: {
        card: "0 18px 60px rgba(0, 0, 0, 0.28)",
        glow: "0 0 32px rgba(31, 232, 122, 0.18)",
        amber: "0 0 28px rgba(245, 158, 11, 0.14)",
        indigo: "0 0 28px rgba(99, 102, 241, 0.16)",
      },
      backgroundImage: {
        atmosphere:
          "radial-gradient(circle at 20% 0%, rgba(31, 232, 122, 0.12), transparent 28%), radial-gradient(circle at 80% 10%, rgba(99, 102, 241, 0.12), transparent 30%), linear-gradient(180deg, #06080D 0%, #080B12 100%)",
      },
    },
  },
  plugins: [animate],
};
