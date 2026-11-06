"use client";

import React, { useEffect, useState } from "react";
import { Save, ShieldCheck, Cpu, HardDrive } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";

interface HealthInfo {
  status: string;
  opencv_version: string;
  paddleocr_version: string;
  max_batch_size: number;
  max_file_size_mb: number;
  worker_concurrency: number;
}

export default function SettingsPage() {
  const { user, organization, refreshUser } = useAuth();
  const { success, error: showError } = useToast();

  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    if (user) setFullName(user.full_name || "");
    if (organization) setOrgName(organization.name || "");
  }, [user, organization]);

  useEffect(() => {
    fetch(`${api.baseUrl}/api/v1/health`)
      .then((r) => r.json())
      .then((data) => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.updateProfile({
        full_name: fullName.trim() || undefined,
        organization_name: orgName.trim() || undefined,
        current_password: currentPassword || undefined,
        new_password: newPassword || undefined,
      });
      setCurrentPassword("");
      setNewPassword("");
      await refreshUser();
      success("Settings saved", "Your workspace profile has been updated.");
    } catch (err) {
      showError(
        "Update failed",
        err instanceof Error ? err.message : "Could not save settings."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#101F50] tracking-tight">
            Workspace & Account Settings
          </h1>
          <p className="text-xs text-[#5A6782] mt-0.5">
            Manage your profile, organization workspace, security credentials,
            and local OCR engine configuration.
          </p>
        </div>

        <form
          onSubmit={handleSave}
          className="bg-white border border-[#DDE4F0] rounded-xl p-6 space-y-6"
        >
          <h2 className="text-base font-semibold text-[#101F50] pb-3 border-b border-[#DDE4F0]">
            Profile & Organization
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <Input
              label="Account Email"
              value={user?.email || ""}
              disabled
              helperText="Primary workspace login identifier."
            />
            <div className="sm:col-span-2">
              <Input
                label="Workspace / Organization Name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>
          </div>

          <h2 className="text-base font-semibold text-[#101F50] pt-4 pb-3 border-b border-[#DDE4F0]">
            Change Password (Optional)
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Leave blank to keep unchanged"
            />
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              isLoading={isSaving}
              leftIcon={<Save className="w-4 h-4 text-[#19C6B3]" />}
            >
              Save Workspace Settings
            </Button>
          </div>
        </form>

        {/* System & OCR Engine Status */}
        <div className="bg-white border border-[#DDE4F0] rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-[#101F50] pb-3 border-b border-[#DDE4F0]">
            Local OCR & Security Infrastructure Status
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-[#F3F6FB] border border-[#DDE4F0] space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-[#101F50]">
                <Cpu className="w-4 h-4 text-[#3478F6]" />
                <span>OCR Engine</span>
              </div>
              <p className="text-[#202B42]">
                PaddleOCR:{" "}
                <strong className="font-mono">
                  {health?.paddleocr_version || "3.1.0"}
                </strong>
              </p>
              <p className="text-[#202B42]">
                OpenCV:{" "}
                <strong className="font-mono">
                  {health?.opencv_version || "4.11.0"}
                </strong>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F3F6FB] border border-[#DDE4F0] space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-[#101F50]">
                <HardDrive className="w-4 h-4 text-[#19C6B3]" />
                <span>Batch Queue Limits</span>
              </div>
              <p className="text-[#202B42]">
                Max Batch Size:{" "}
                <strong className="font-mono">
                  {health?.max_batch_size || 50} cards
                </strong>
              </p>
              <p className="text-[#202B42]">
                Worker Concurrency:{" "}
                <strong className="font-mono">
                  {health?.worker_concurrency || 3} threads
                </strong>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F3F6FB] border border-[#DDE4F0] space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-[#101F50]">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>Privacy & RLS</span>
              </div>
              <p className="text-[#202B42]">
                External AI APIs: <strong>Disabled (100% Local)</strong>
              </p>
              <p className="text-[#202B42]">
                Storage: <strong>Private Signed URLs</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

