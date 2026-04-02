"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addToast } from "@heroui/toast";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";
import { Zap, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { authApi, getErrorMessage } from "@/lib/api";
import { storeAuth } from "@/hooks/useAuth";
import { AuthResponse } from "@/types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      addToast({ title: "Please fill in all fields", color: "warning" });
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      const { token, user } = res.data.data as AuthResponse;
      storeAuth(token, user);
      addToast({ title: `Welcome back, ${user.full_name}!`, color: "success" });
      router.push("/dashboard");
    } catch (err) {
      addToast({ title: "Login failed", description: getErrorMessage(err), color: "danger" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 via-background to-background dark:from-primary-950 dark:via-background dark:to-background p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/40 mb-4">
            <Zap className="w-9 h-9 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">BlueWatt</h1>
          <p className="text-default-500 mt-1 text-sm">Electrical Monitoring — Admin</p>
        </div>

        <Card className="shadow-2xl border border-default-200/50 backdrop-blur-sm bg-content1/90">
          <CardHeader className="pb-0 pt-6 px-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Sign in</h2>
              <p className="text-default-500 text-sm mt-0.5">Enter your credentials to continue</p>
            </div>
          </CardHeader>
          <CardBody className="px-6 pb-6 pt-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                type="email"
                label="Email address"
                placeholder="admin@example.com"
                value={email}
                onValueChange={setEmail}
                startContent={<Mail className="w-4 h-4 text-default-400" />}
                variant="bordered"
                classNames={{ inputWrapper: "border-default-300 hover:border-primary focus-within:border-primary" }}
                isDisabled={loading}
              />
              <Input
                type={showPass ? "text" : "password"}
                label="Password"
                placeholder="••••••••"
                value={password}
                onValueChange={setPassword}
                startContent={<Lock className="w-4 h-4 text-default-400" />}
                endContent={
                  <button type="button" onClick={() => setShowPass((p) => !p)} className="text-default-400 hover:text-primary transition-colors">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                variant="bordered"
                classNames={{ inputWrapper: "border-default-300 hover:border-primary focus-within:border-primary" }}
                isDisabled={loading}
              />
              <Button
                type="submit"
                color="primary"
                size="lg"
                className="mt-2 font-semibold shadow-lg shadow-primary/30"
                isLoading={loading}
                fullWidth
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="text-center text-default-400 text-xs mt-6">
          BlueWatt © {new Date().getFullYear()} — Thesis Project
        </p>
      </div>
    </div>
  );
}
