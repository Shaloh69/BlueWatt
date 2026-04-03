import { heroui } from "@heroui/theme";

export default heroui({
  themes: {
    dark: {
      colors: {
        background: "#020c1b",
        foreground: "#ccd6f6",

        primary: {
          50:  "#e0f4ff",
          100: "#bae6fd",
          200: "#7dd3fc",
          300: "#38bdf8",
          400: "#0ea5e9",
          500: "#0284c7",
          600: "#0369a1",
          700: "#075985",
          800: "#0c4a6e",
          900: "#082f49",
          DEFAULT: "#0ea5e9",
          foreground: "#ffffff",
        },

        secondary: {
          DEFAULT: "#1d4ed8",
          foreground: "#ffffff",
        },

        default: {
          50:  "#0d1b2e",
          100: "#112240",
          200: "#162d4a",
          300: "#1e3a5f",
          400: "#2d527a",
          500: "#4a7a9b",
          600: "#6fa3bf",
          700: "#a0c4d8",
          800: "#cce1ee",
          900: "#eaf4fa",
          DEFAULT: "#162d4a",
          foreground: "#ccd6f6",
        },

        content1: "#0d1b2e",
        content2: "#112240",
        content3: "#162d4a",
        content4: "#1e3a5f",

        focus: "#0ea5e9",

        success: {
          DEFAULT: "#17c964",
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#f5a524",
          foreground: "#ffffff",
        },
        danger: {
          DEFAULT: "#f31260",
          foreground: "#ffffff",
        },
      },
    },

    light: {
      colors: {
        background: "#f0f7ff",
        foreground: "#0c1f38",

        primary: {
          DEFAULT: "#0284c7",
          foreground: "#ffffff",
        },

        default: {
          DEFAULT: "#e1effe",
          foreground: "#0c1f38",
        },

        content1: "#ffffff",
        content2: "#f0f7ff",
        content3: "#dbeafe",
        content4: "#bfdbfe",

        focus: "#0284c7",
      },
    },
  },
});
