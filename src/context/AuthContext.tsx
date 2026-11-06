"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { api, clearAuthCookie } from "@/lib/api";
import type { Organization, Profile } from "@/types/database";

interface AuthContextValue {
  user: Profile | null;
  organization: Organization | null;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.getMe();
      setUser(data.user);
      setOrganization(data.organization);
    } catch {
      setUser(null);
      setOrganization(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Proactively wake up / keep warm the OCR backend as soon as any page loads
    void api.warmupBackend();

    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
    if (isPublic) {
      setIsLoading(false);
      return;
    }
    refreshUser();
  }, [pathname, refreshUser]);

  const signOut = useCallback(async () => {
    await api.logout();
    clearAuthCookie();
    setUser(null);
    setOrganization(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, organization, isLoading, refreshUser, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

