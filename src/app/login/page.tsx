"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, ShieldCheck, Layers, Cpu, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const performLogin = async (loginEmail: string, loginPassword: string) => {
    setFormError("");
    if (!loginEmail.trim() || !loginPassword) {
      setFormError("Please enter both your email address and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.login({ email: loginEmail.trim(), password: loginPassword });
      await refreshUser();
      success("Signed in", "Welcome back to CardFlow.");
      router.push("/dashboard");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Invalid login credentials.";
      setFormError(msg);
      showError("Sign in failed", msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(email, password);
  };

  const handleAdminQuickLogin = async () => {
    const adminEmail = "admin@cardflow.app";
    const adminPass = "Admin@123456";
    setEmail(adminEmail);
    setPassword(adminPass);
    await performLogin(adminEmail, adminPass);
  };

  return (
    <div className="min-h-[100dvh] grid grid-cols-1 lg:grid-cols-12 bg-[#F3F6FB]">
      {/* Left Brand Panel */}
      <div className="hidden lg:flex lg:col-span-5 bg-[#101F50] text-white p-10 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#19C6B3] text-[#101F50] flex items-center justify-center font-bold">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight block leading-none">
              CardFlow
            </span>
            <span className="text-xs text-slate-300 mt-1 block">
              Visiting Card OCR & Contact CRM
            </span>
          </div>
        </div>

        <div className="space-y-6 my-auto py-12">
          <h1 className="text-3xl font-bold tracking-tight leading-snug text-white">
            Convert physical visiting cards into structured contacts locally.
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed max-w-md">
            Powered by OpenCV image enhancement and local PaddleOCR with hybrid
            field classification. No external AI APIs required.
          </p>

          <div className="space-y-4 pt-4 border-t border-white/10">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-white/10 text-[#19C6B3] shrink-0">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  100% On-Premise OCR Engine
                </p>
                <p className="text-xs text-slate-300 mt-0.5">
                  Card images are processed locally with OpenCV and PaddleOCR.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-white/10 text-[#19C6B3] shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  Bulk Batch Scanning (Up to 50 Cards)
                </p>
                <p className="text-xs text-slate-300 mt-0.5">
                  Asynchronous queue workers with per-card confidence scoring
                  and retry controls.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-white/10 text-[#19C6B3] shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  Row Level Security & Signed Storage
                </p>
                <p className="text-xs text-slate-300 mt-0.5">
                  Strict workspace isolation and private card image buckets.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400">CardFlow Workspace Platform</p>
      </div>

      {/* Right Form Panel */}
      <div className="lg:col-span-7 flex items-center justify-center p-4 sm:p-10">
        <div className="w-full max-w-md bg-white border border-[#DDE4F0] rounded-xl p-5 sm:p-8 shadow-xs">
          <div className="flex lg:hidden items-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-xl bg-[#101F50] text-[#19C6B3] flex items-center justify-center font-bold">
              <CreditCard className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold text-[#101F50]">CardFlow</span>
          </div>

          <h2 className="text-xl font-bold text-[#101F50]">
            Sign in to your workspace
          </h2>
          <p className="text-xs text-[#5A6782] mt-1">
            Enter your credentials to access your scanned cards and CRM contacts.
          </p>

          {/* Instant Admin Account Box */}
          <div className="mt-4 p-3.5 rounded-xl bg-[#F3F6FB] border border-[#DDE4F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs">
              <p className="font-semibold text-[#101F50] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#3478F6]" />
                <span>Admin Account Ready</span>
              </p>
              <p className="font-mono text-[11px] text-[#5A6782] mt-0.5">
                admin@cardflow.app / Admin@123456
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={isSubmitting}
              onClick={handleAdminQuickLogin}
              className="shrink-0"
            >
              One-Click Admin Sign In
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
            <Input
              label="Email Address"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="admin@cardflow.app"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              rightElement={
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-[#3478F6] hover:underline"
                >
                  Forgot password?
                </Link>
              }
            />

            {formError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium"
              >
                {formError}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              className="w-full"
            >
              Sign In
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#DDE4F0] text-center">
            <p className="text-xs text-[#5A6782]">
              New to CardFlow?{" "}
              <Link
                href="/register"
                className="font-semibold text-[#3478F6] hover:underline"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
