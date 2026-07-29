"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ServerHeaderState } from "@/lib/public-auth/server-header-state";

// Carries the server-resolved header state to the client tree (Randall,
// 2026-07-28). The layout is a Server Component and every page.tsx is too, but
// SiteHeader is rendered inside client components, so context is what gets the
// state across without drilling a prop through six pages.

const AccountSessionContext = createContext<ServerHeaderState | null>(null);

export function AccountSessionProvider({
  value,
  children,
}: {
  value: ServerHeaderState;
  children: ReactNode;
}) {
  return <AccountSessionContext.Provider value={value}>{children}</AccountSessionContext.Provider>;
}

// Null when a tree renders outside the provider — callers fall back to resolving
// in the browser rather than throwing.
export function useServerHeaderState(): ServerHeaderState | null {
  return useContext(AccountSessionContext);
}
