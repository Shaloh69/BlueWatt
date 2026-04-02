"use client";

import { User } from "@/types";

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("bw_user");
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bw_token");
}

export function storeAuth(token: string, user: User) {
  localStorage.setItem("bw_token", token);
  localStorage.setItem("bw_user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("bw_token");
  localStorage.removeItem("bw_user");
}
