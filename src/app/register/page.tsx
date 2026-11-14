"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const { refreshUser } = useAuth();
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!fullName.trim() || !email.trim() || !password) {
      setFormError("Please fill in all required fields.");
      return;
    }
    if (password.length < 6) {
      setFormError("Password must be at least 6 characters long.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.register({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        organization_name: organizationName.trim() || undefined,
      });
      await refreshUser();
      success("Account created", "Your CardFlow workspace is ready.");
      router.push("/dashboard");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not complete registration.";
      setFormError(msg);
      showError("Registration failed", msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-[#F3F6FB]">
      <div className="w-full max-w-md bg-white border border-[#DDE4F0] rounded-xl p-6 sm:p-8 shadow-xs">
        <div className="mb-6">
          <BrandLogo
            variant="light"
            size="md"
            subtitle="Smart Visiting Card Scanner & CRM"
          />
        </div>

        <h1 className="text-xl font-bold text-[#101F50]">
          Create your workspace
        </h1>
        <p className="text-xs text-[#5A6782] mt-1">
          Start scanning visiting cards and organizing contacts in seconds.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <Input
            label="Full Name"
            type="text"
            name="fullName"
            autoComplete="name"
            placeholder="Aarav Mehta"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />

          <Input
            label="Organization / Workspace Name"
            type="text"
            name="organizationName"
            placeholder="Mehta Ventures Pvt Ltd (Optional)"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            helperText="Leave blank to create a personal workspace automatically."
          />

          <Input
            label="Work Email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="aarav@mehtaventures.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="Minimum 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
            Create Account
          </Button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#DDE4F0] text-center">
          <p className="text-xs text-[#5A6782]">
            Already have a workspace?{" "}
            <Link
              href="/login"
              className="font-semibold text-[#3478F6] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

