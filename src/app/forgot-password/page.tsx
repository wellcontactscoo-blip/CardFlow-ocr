"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CreditCard, ArrowLeft, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

export default function ForgotPasswordPage() {
  const { success, error: showError } = useToast();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await api.forgotPassword(email.trim());
      setSubmitted(true);
      if (res.reset_token) {
        setResetToken(res.reset_token);
      }
      success("Password reset initiated", res.message);
    } catch (err) {
      showError(
        "Request failed",
        err instanceof Error ? err.message : "Could not process request."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-[#F3F6FB]">
      <div className="w-full max-w-md bg-white border border-[#DDE4F0] rounded-xl p-6 sm:p-8 shadow-xs">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-xl bg-[#101F50] text-[#19C6B3] flex items-center justify-center font-bold">
            <CreditCard className="w-5 h-5" />
          </div>
          <span className="text-lg font-bold text-[#101F50]">CardFlow</span>
        </div>

        <h1 className="text-xl font-bold text-[#101F50]">
          Reset your password
        </h1>
        <p className="text-xs text-[#5A6782] mt-1">
          Enter the email address associated with your CardFlow account.
        </p>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Input
              label="Email Address"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              className="w-full"
            >
              Send Reset Instructions
            </Button>
          </form>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 space-y-2">
              <p className="font-semibold">Reset instructions ready</p>
              <p>
                If an account exists for <strong>{email}</strong>, password
                recovery has been prepared.
              </p>
              {resetToken && (
                <div className="pt-2 border-t border-teal-200">
                  <p className="font-medium text-teal-800 mb-1">
                    Local Verification Token:
                  </p>
                  <code className="block p-2 rounded bg-white font-mono text-[11px] break-all border border-teal-200">
                    {resetToken}
                  </code>
                  <Link
                    href={`/reset-password?email=${encodeURIComponent(
                      email
                    )}&token=${encodeURIComponent(resetToken)}`}
                    className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-[#3478F6] hover:underline"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Proceed to Reset Password Page</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-[#DDE4F0]">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3478F6] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

