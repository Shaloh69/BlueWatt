import { heroui } from "@heroui/theme";

export default heroui({
  themes: {
    light: {
      colors: {
        primary: {
          50: "#e6f1fe",
          100: "#cce3fd",
          200: "#99c7fb",
          300: "#66aaf9",
          400: "#338ef7",
          500: "#006FEE",
          600: "#005bc4",
          700: "#004493",
          800: "#002e62",
          900: "#001731",
          DEFAULT: "#006FEE",
          foreground: "#FFFFFF",
        },
        focus: "#006FEE",
      },
    },
    dark: {
      colors: {
        primary: {
          50: "#001731",
          100: "#002e62",
          200: "#004493",
          300: "#005bc4",
          400: "#006FEE",
          500: "#338ef7",
          600: "#66aaf9",
          700: "#99c7fb",
          800: "#cce3fd",
          900: "#e6f1fe",
          DEFAULT: "#006FEE",
          foreground: "#FFFFFF",
        },
        focus: "#006FEE",
      },
    },
  },
});
