"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ScanLine,
  Layers,
  Users,
  History,
  Tag as TagIcon,
  Settings,
  LogOut,
  Menu,
  X,
  Building2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { BrandLogo } from "@/components/ui/BrandLogo";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/scan", label: "Scan Cards", icon: ScanLine },
  { href: "/bulk-scan", label: "Bulk Scanner", icon: Layers },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/history", label: "Scan History", icon: History },
  { href: "/tags", label: "Tags", icon: TagIcon },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, organization, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col lg:flex-row bg-[#F3F6FB] text-[#202B42]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#101F50] text-white border-r border-[#1C3175] z-30">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-white/10">
          <BrandLogo
            variant="dark"
            size="md"
            subtitle="Smart Card OCR & CRM"
          />
        </div>

        {organization && (
          <div className="px-4 py-3 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-2 text-xs text-slate-200 truncate">
              <Building2 className="w-3.5 h-3.5 text-[#19C6B3] shrink-0" />
              <span className="font-medium truncate">{organization.name}</span>
            </div>
          </div>
        )}

        <nav
          aria-label="Main Navigation"
          className="flex-1 px-3 py-4 space-y-1 overflow-y-auto"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#3478F6] text-white shadow-sm"
                    : "text-slate-200 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 bg-[#0C173D]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {user?.full_name || "Workspace User"}
              </p>
              <p className="text-[11px] text-slate-300 truncate">
                {user?.email || ""}
              </p>
            </div>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile & Tablet Header */}
      <header className="lg:hidden sticky top-0 z-30 h-14 bg-[#101F50] text-white px-3.5 sm:px-5 flex items-center justify-between border-b border-white/10">
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <BrandLogo
            variant="dark"
            size="sm"
            subtitle={organization?.name}
          />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/scan"
            className="inline-flex items-center justify-center gap-1.5 bg-[#19C6B3] text-[#101F50] font-semibold text-xs h-9 px-3 rounded-lg shadow-2xs"
          >
            <ScanLine className="w-3.5 h-3.5" />
            <span>Scan</span>
          </Link>
          <button
            type="button"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 cursor-pointer"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Slide-out Drawer with Backdrop Dismiss */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-[#101F50]/60 backdrop-blur-xs"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="bg-[#101F50] text-white w-72 max-w-[85vw] h-full p-4 flex flex-col justify-between shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <span className="font-bold text-base">Navigation</span>
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium ${
                        active
                          ? "bg-[#3478F6] text-white"
                          : "text-slate-200 hover:bg-white/10"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">
                  {user?.full_name || "Workspace User"}
                </p>
                <p className="text-[11px] text-slate-300 truncate">
                  {user?.email || ""}
                </p>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-1.5 text-xs text-rose-300 hover:text-rose-200 px-3 py-2 rounded-lg bg-white/5 shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full min-w-0 lg:pl-64 pb-24 lg:pb-10">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation with Safe-Area Support */}
      <nav
        aria-label="Mobile Quick Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 min-h-16 pb-[env(safe-area-inset-bottom,0px)] bg-white/95 backdrop-blur-md border-t border-[#DDE4F0] grid grid-cols-5 items-center px-1 shadow-lg"
      >
        <Link
          href="/dashboard"
          className={`flex flex-col items-center justify-center py-2 gap-1 text-[11px] font-medium ${
            isActive("/dashboard") ? "text-[#3478F6]" : "text-[#5A6782]"
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Home</span>
        </Link>
        <Link
          href="/contacts"
          className={`flex flex-col items-center justify-center py-2 gap-1 text-[11px] font-medium ${
            isActive("/contacts") ? "text-[#3478F6]" : "text-[#5A6782]"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Contacts</span>
        </Link>
        <Link
          href="/scan"
          className="flex flex-col items-center justify-center -mt-4"
        >
          <div className="w-11 h-11 rounded-full bg-[#101F50] text-white flex items-center justify-center shadow-md border-2 border-white">
            <ScanLine className="w-5 h-5 text-[#19C6B3]" />
          </div>
          <span className="text-[10px] font-semibold text-[#101F50] mt-0.5">
            Scan Card
          </span>
        </Link>
        <Link
          href="/bulk-scan"
          className={`flex flex-col items-center justify-center py-2 gap-1 text-[11px] font-medium ${
            isActive("/bulk-scan") ? "text-[#3478F6]" : "text-[#5A6782]"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Bulk</span>
        </Link>
        <Link
          href="/history"
          className={`flex flex-col items-center justify-center py-2 gap-1 text-[11px] font-medium ${
            isActive("/history") ? "text-[#3478F6]" : "text-[#5A6782]"
          }`}
        >
          <History className="w-4 h-4" />
          <span>History</span>
        </Link>
      </nav>
    </div>
  );
}
