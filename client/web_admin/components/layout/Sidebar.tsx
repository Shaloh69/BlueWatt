"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@heroui/button";
import { Avatar } from "@heroui/avatar";
import { Chip } from "@heroui/chip";
import { toast } from "@/lib/toast";
import {
  LayoutDashboard, Zap, MonitorDot, Cpu, Building2, Receipt,
  CreditCard, BarChart3, AlertTriangle, LogOut, ChevronLeft,
  ChevronRight, Moon, Sun, Settings,
} from "lucide-react";
import { useTheme } from "next-themes";
import { clearAuth, getStoredUser } from "@/hooks/useAuth";
import { User } from "@/types";
import clsx from "clsx";

const NAV = [
  { href: "/dashboard",  label: "Dashboard",     icon: LayoutDashboard },
  { href: "/live",       label: "Live Monitor",  icon: MonitorDot,  badge: "LIVE" },
  { href: "/devices",    label: "Devices",       icon: Cpu },
  { href: "/pads",       label: "Pads",          icon: Building2 },
  { href: "/billing",    label: "Billing",       icon: Receipt },
  { href: "/payments",   label: "Payments",      icon: CreditCard },
  { href: "/reports",    label: "Reports",       icon: BarChart3 },
  { href: "/anomalies",  label: "Anomalies",     icon: AlertTriangle },
  { href: "/settings",   label: "Settings",      icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setUser(getStoredUser());

    function onStorage(e: StorageEvent) {
      if (e.key === "bw_user") setUser(getStoredUser());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function handleLogout() {
    clearAuth();
    toast.info("Logged out successfully");
    router.push("/login");
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside
      className={clsx(
        "relative flex flex-col h-screen bg-content1 border-r border-default-200 transition-all duration-300 ease-in-out shrink-0",
        collapsed ? "w-[68px]" : "w-[240px]",
      )}
    >
      {/* Logo */}
      <div className={clsx("flex items-center gap-3 px-4 py-5 border-b border-default-200", collapsed && "justify-center px-0")}>
        <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-primary/30">
          <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div>
            <p className="font-bold text-foreground text-base leading-none">BlueWatt</p>
            <p className="text-default-400 text-xs mt-0.5">Admin Panel</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href}>
              <div
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 group relative",
                  active
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "text-default-600 hover:bg-default-100 hover:text-foreground",
                  collapsed && "justify-center px-0 py-2.5",
                )}
                title={collapsed ? label : undefined}
              >
                <Icon className={clsx("w-5 h-5 shrink-0", active ? "text-white" : "text-default-500 group-hover:text-primary")} />
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1">{label}</span>
                    {badge && (
                      <Chip size="sm" color="success" variant="flat" className="text-[10px] h-4 px-1">
                        {badge}
                      </Chip>
                    )}
                  </>
                )}
                {/* Tooltip on collapsed */}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-foreground text-background text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    {label}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-default-200 p-2 space-y-1">
        {/* Theme toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={clsx(
              "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-default-600 hover:bg-default-100 hover:text-foreground transition-all",
              collapsed && "justify-center px-0",
            )}
            title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          >
            {theme === "dark"
              ? <Sun className="w-5 h-5 shrink-0 text-default-500" />
              : <Moon className="w-5 h-5 shrink-0 text-default-500" />}
            {!collapsed && <span className="text-sm font-medium">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
          </button>
        )}

        {/* User — links to settings */}
        {user && (
          <Link href="/settings">
            <div className={clsx(
              "flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-default-100 transition-all cursor-pointer",
              collapsed && "justify-center px-0",
            )}>
              <Avatar
                name={user.full_name}
                src={user.profile_image_url ?? undefined}
                size="sm"
                className="shrink-0"
                color="primary"
              />
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{user.full_name}</p>
                  <p className="text-xs text-default-400 truncate">{user.email}</p>
                </div>
              )}
            </div>
          </Link>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={clsx(
            "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-danger hover:bg-danger/10 transition-all",
            collapsed && "justify-center px-0",
          )}
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Logout</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <Button
        isIconOnly
        size="sm"
        variant="flat"
        className="absolute -right-3.5 top-[72px] z-10 rounded-full bg-content1 border border-default-200 shadow-sm w-7 h-7 min-w-0"
        onPress={() => setCollapsed((c) => !c)}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </Button>
    </aside>
  );
}
