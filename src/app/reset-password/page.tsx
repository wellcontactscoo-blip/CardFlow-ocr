"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: showError } = useToast();

  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [token, setToken] = useState(searchParams.get("token") || "");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !token.trim() || newPassword.length < 6) {
      showError(
        "Validation Error",
        "Please provide email, reset token, and a password of at least 6 characters."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await api.resetPassword({
        email: email.trim(),
        reset_token: token.trim(),
        new_password: newPassword,
      });
      success("Password updated", "You can now sign in with your new password.");
      router.push("/login");
    } catch (err) {
      showError(
        "Reset failed",
        err instanceof Error ? err.message : "Invalid or expired reset token."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <Input
        label="Account Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        label="Reset Token"
        type="text"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        required
      />
      <Input
        label="New Password"
        type="password"
        placeholder="Minimum 6 characters"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        isLoading={isSubmitting}
        className="w-full"
      >
        Update Password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-[#F3F6FB]">
      <div className="w-full max-w-md bg-white border border-[#DDE4F0] rounded-xl p-6 sm:p-8 shadow-xs">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-xl bg-[#101F50] text-[#19C6B3] flex items-center justify-center font-bold">
            <CreditCard className="w-5 h-5" />
          </div>
          <span className="text-lg font-bold text-[#101F50]">CardFlow</span>
        </div>

        <h1 className="text-xl font-bold text-[#101F50]">Set a new password</h1>
        <p className="text-xs text-[#5A6782] mt-1">
          Enter your reset token and choose a new password.
        </p>

        <Suspense fallback={<div className="py-8 text-xs text-[#5A6782]">Loading form...</div>}>
          <ResetPasswordForm />
        </Suspense>

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

