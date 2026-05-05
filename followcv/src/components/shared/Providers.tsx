'use client'

import type { ReactNode } from 'react'

// Client boundary wrapper — extended in later stories with auth session, toast, and query providers.
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>
}
