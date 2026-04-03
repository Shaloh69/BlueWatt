import { addToast } from "@heroui/toast";

export const toast = {
  success: (message: string) =>
    addToast({ title: "Success", description: message, color: "success", variant: "flat", timeout: 4000 }),

  error: (message: string) =>
    addToast({ title: "Error", description: message, color: "danger", variant: "flat", timeout: 7000, shouldShowTimeoutProgress: true }),

  warning: (message: string) =>
    addToast({ title: "Warning", description: message, color: "warning", variant: "flat", timeout: 5000, shouldShowTimeoutProgress: true }),

  info: (message: string) =>
    addToast({ title: "Info", description: message, color: "primary", variant: "flat", timeout: 4000 }),
};
