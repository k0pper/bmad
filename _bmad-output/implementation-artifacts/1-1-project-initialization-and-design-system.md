# Story 1.1: Project Initialization & Design System Foundation

Status: done

## Story

As a **developer**,
I want the Next.js project initialized with the full design system foundation,
so that every subsequent story builds on a consistent, deployable base with correct tooling.

## Acceptance Criteria

1. `npx create-next-app@latest followcv --typescript --tailwind --eslint --app --src-dir` produces a working Next.js project with Turbopack dev server, TypeScript strict mode, and `src/` directory structure.
2. `npx shadcn@latest init` completes with Tailwind v4 integration and the `src/components/ui/` directory created.
3. `globals.css` contains the Tailwind v4 `@theme` block with all FollowCV design tokens: indigo-600 brand color, slate surface scale, semantic status colors, and 4px spacing grid.
4. Inter variable font is self-hosted in `public/fonts/` and applied as the default sans-serif via `@theme` in `globals.css`.
5. The root `layout.tsx` loads Inter with `font-display: swap` and wraps the app in a `Providers` client component.
6. The dashboard shell layout is implemented as `src/app/(dashboard)/layout.tsx` — 256px fixed left sidebar + fluid main content area — with placeholder nav links and user menu slot.
7. `npm run dev` starts without errors and the landing page renders at `localhost:3000`.
8. GitHub Actions CI workflow file runs typecheck, ESLint, and Vitest on every PR with zero initial failures.

## Tasks / Subtasks

- [x] Task 1: Initialize Next.js project (AC: 1, 2)
  - [x] Run `npx create-next-app@latest followcv --typescript --tailwind --eslint --app --src-dir` in the workspace root. The project directory must be named `followcv/`.
  - [x] `cd followcv` and run `npx shadcn@latest init` — select "Default" style, accept all Tailwind v4 defaults. Do NOT use the old `shadcn-ui` package — use `shadcn` (without the `-ui` suffix).
  - [x] Install Vitest and Testing Library: `npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom`
  - [x] Add `vitest.config.ts` at the project root (see Dev Notes for config)
  - [x] Add `"test": "vitest"` and `"test:run": "vitest run"` to `package.json` scripts
  - [x] Verify `npm run dev` starts without errors

- [x] Task 2: Configure Tailwind v4 design tokens (AC: 3)
  - [x] Replace the contents of `src/app/globals.css` with the full FollowCV token set (see Dev Notes for exact content)
  - [x] Confirm all `@theme` custom properties are present: `--color-brand`, `--color-brand-hover`, `--color-brand-subtle`, `--color-surface`, `--color-border`, `--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`, `--color-success`, `--color-warning`, `--color-danger`, `--color-info`
  - [x] Confirm vitality state badge tokens are present: `--color-vitality-hot-bg`, `--color-vitality-hot-text`, and the equivalent for all 8 states
  - [x] Confirm spacing token: `--spacing-base: 4px`

- [x] Task 3: Self-host Inter variable font (AC: 4, 5)
  - [x] Download `InterVariable.woff2` (the single variable-weight file) from the Inter GitHub releases — latest stable. Place it at `public/fonts/InterVariable.woff2`.
  - [x] Add `@font-face` declaration in `globals.css` for Inter (see Dev Notes for exact declaration)
  - [x] Set `--font-sans` in the `@theme` block to use Inter as the default sans-serif
  - [x] **Do NOT use `next/font/google`** — the ACs require self-hosting. `next/font/google` fetches at build time which is fine for some setups but the story explicitly requires `public/fonts/`.

- [x] Task 4: Root layout and Providers (AC: 5)
  - [x] Update `src/app/layout.tsx` to apply `font-sans` class on `<html>` and add `<Providers>` wrapper around `{children}`
  - [x] Create `src/components/shared/Providers.tsx` as a `"use client"` component — for now it only renders `{children}`; it will be extended in later stories to wrap auth providers, toasts, etc.
  - [x] Confirm `layout.tsx` includes `<head>` with `<meta name="viewport" content="width=device-width, initial-scale=1" />`

- [x] Task 5: Dashboard shell layout (AC: 6)
  - [x] Create `src/app/(dashboard)/layout.tsx` as a Server Component
  - [x] Implement 256px fixed left sidebar (`<aside>`) + fluid main (`<main>`) side-by-side layout (see Dev Notes for structure)
  - [x] Sidebar must use `bg-[var(--color-surface)] border-r border-[var(--color-border)]` classes
  - [x] Include placeholder nav links: "Board" pointing to `/board`, "Settings" pointing to `/settings`
  - [x] Include a placeholder user menu slot (`<div className="user-menu-slot" />`) at the bottom of the sidebar — will be wired up in Story 1.3
  - [x] Include a `HealthScoreWidget` placeholder slot at the top of the sidebar — just a `<div data-testid="health-score-slot" />` for now
  - [x] Create `src/app/(dashboard)/board/page.tsx` as a minimal placeholder page (heading "Your Board" + "Coming in Story 2")

- [x] Task 6: GitHub Actions CI workflow (AC: 8)
  - [x] Create `.github/workflows/ci.yml` — triggers on `pull_request` and `push` to `main`
  - [x] Jobs: `typecheck` (`tsc --noEmit`), `lint` (`next lint`), `test` (`vitest run`)
  - [x] Verify the workflow file is valid YAML and all three commands pass locally before committing

- [x] Task 7: Final verification (AC: 7, 8)
  - [x] Run `npm run dev` — confirm no console errors, page loads at `localhost:3000`
  - [x] Run `npm run build` — confirm no TypeScript errors and build succeeds
  - [x] Run `npm run test:run` — confirm Vitest finds at least zero tests (no failures)
  - [x] Run `next lint` — confirm zero ESLint errors
  - [x] Run `tsc --noEmit` — confirm zero type errors

## Dev Notes

### Critical: Tailwind v4 vs v3

**Tailwind CSS v4 has a completely different configuration model.** There is NO `tailwind.config.js`. All tokens are defined in `globals.css` using `@theme`. Any v3 patterns (like `extend.colors` in config) will not work.

`shadcn@latest init` with Tailwind v4 will NOT generate a `tailwind.config.js`. If one appears, delete it — it means the wrong version was used.

### `globals.css` — Full Token Set

Replace the default `globals.css` with:

```css
@import "tailwindcss";

@theme {
  /* Brand */
  --color-brand: #4F46E5;           /* indigo-600 */
  --color-brand-hover: #4338CA;     /* indigo-700 */
  --color-brand-subtle: #EEF2FF;    /* indigo-50 */

  /* Surfaces & Structure */
  --color-background: #FFFFFF;
  --color-surface: #F8FAFC;         /* slate-50 */
  --color-border: #E2E8F0;          /* slate-200 */

  /* Text */
  --color-text-primary: #0F172A;    /* slate-900 */
  --color-text-secondary: #475569;  /* slate-600 */
  --color-text-tertiary: #94A3B8;   /* slate-400 */

  /* Semantic Status */
  --color-success: #059669;         /* emerald-600 */
  --color-warning: #F59E0B;         /* amber-500 */
  --color-danger: #EF4444;          /* red-500 */
  --color-info: #0EA5E9;            /* sky-500 */

  /* Vitality State Badge System (bg / text) */
  --color-vitality-hot-bg: #FEF3C7;       /* amber-100 */
  --color-vitality-hot-text: #B45309;     /* amber-700 */
  --color-vitality-deadline-bg: #FFEDD5;  /* orange-100 */
  --color-vitality-deadline-text: #C2410C; /* orange-700 */
  --color-vitality-active-bg: #D1FAE5;    /* emerald-100 */
  --color-vitality-active-text: #047857;  /* emerald-700 */
  --color-vitality-dialogue-bg: #DBEAFE;  /* blue-100 */
  --color-vitality-dialogue-text: #1D4ED8; /* blue-700 */
  --color-vitality-cooling-bg: #E0F2FE;   /* sky-100 */
  --color-vitality-cooling-text: #0284C7; /* sky-600 */
  --color-vitality-cold-bg: #F1F5F9;      /* slate-100 */
  --color-vitality-cold-text: #475569;    /* slate-600 */
  --color-vitality-ghosting-bg: #F3E8FF;  /* purple-100 */
  --color-vitality-ghosting-text: #9333EA; /* purple-600 */
  --color-vitality-closed-bg: #F5F5F5;    /* neutral-100 */
  --color-vitality-closed-text: #737373;  /* neutral-500 */

  /* Typography */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;

  /* Spacing */
  --spacing-base: 4px;

  /* Layout */
  --sidebar-width: 256px;
  --board-row-height: 56px;
  --import-drawer-width: 480px;
}

@layer base {
  @font-face {
    font-family: 'Inter';
    src: url('/fonts/InterVariable.woff2') format('woff2-variations');
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
  }

  * {
    box-sizing: border-box;
  }

  body {
    background-color: var(--color-background);
    color: var(--color-text-primary);
    font-family: var(--font-sans);
  }
}
```

> **Important:** Do not import Tailwind v3's `@tailwind base/components/utilities` — v4 uses `@import "tailwindcss"` instead.

### Inter Font Download

Download the Inter variable font from: https://github.com/rsms/inter/releases/latest

Look for `InterVariable.woff2` in the release assets. This single file covers all weights (100–900) via CSS `font-weight: 100 900` in the `@font-face` declaration.

Place at: `followcv/public/fonts/InterVariable.woff2`

### Vitest Config

Create `followcv/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Create `followcv/src/test-setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

### Dashboard Shell Layout Structure

`src/app/(dashboard)/layout.tsx`:

```tsx
import type { ReactNode } from 'react'
import Link from 'next/link'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className="flex flex-col flex-shrink-0 border-r"
        style={{
          width: 'var(--sidebar-width)',
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        {/* Health score slot — wired up in Story 4.1 */}
        <div data-testid="health-score-slot" className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }} />

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          <Link
            href="/board"
            className="flex items-center px-3 py-2 rounded-md text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Board
          </Link>
          <Link
            href="/settings"
            className="flex items-center px-3 py-2 rounded-md text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Settings
          </Link>
        </nav>

        {/* User menu slot — wired up in Story 1.3 */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div data-testid="user-menu-slot" className="h-10" />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
```

### Root layout.tsx

```tsx
import type { Metadata } from 'next'
import { Providers } from '@/components/shared/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'FollowCV',
  description: 'Your passive-first job search tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="font-sans">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

Note: Do NOT use `next/font` in this story. Font is loaded via the `@font-face` in `globals.css` and the `--font-sans` `@theme` token. This gives Tailwind v4 access to the font token without `next/font`.

### GitHub Actions CI Workflow

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: followcv
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: followcv/package-lock.json
      - run: npm ci
      - run: npx tsc --noEmit

  lint:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: followcv
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: followcv/package-lock.json
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: followcv
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: followcv/package-lock.json
      - run: npm ci
      - run: npm run test:run
```

> **Note:** The CI workflow lives at the repo root (`.github/workflows/ci.yml`) but the working directory for each job is set to `followcv/` because the Next.js project is in a subdirectory of the planning monorepo.

### Project Structure for This Story

Files to create (all relative to `followcv/`):

```
followcv/
├── .github/
│   └── workflows/
│       └── ci.yml
├── public/
│   └── fonts/
│       └── InterVariable.woff2       ← downloaded manually
├── src/
│   ├── app/
│   │   ├── globals.css               ← replaced with full token set
│   │   ├── layout.tsx                ← updated root layout
│   │   ├── page.tsx                  ← landing page (keep default or minimal)
│   │   └── (dashboard)/
│   │       ├── layout.tsx            ← NEW: 256px sidebar shell
│   │       └── board/
│   │           └── page.tsx          ← NEW: placeholder
│   ├── components/
│   │   └── shared/
│   │       └── Providers.tsx         ← NEW: "use client" wrapper
│   └── test-setup.ts                 ← NEW: Vitest setup
├── vitest.config.ts                  ← NEW
└── package.json                      ← updated: test scripts added
```

### What NOT To Do

- **Do NOT** create `tailwind.config.js` — v4 is config-file-free
- **Do NOT** use `next/font/google` for Inter — self-hosting via `public/fonts/` is required
- **Do NOT** import `@tailwind base/components/utilities` — v4 uses `@import "tailwindcss"`
- **Do NOT** wire up Auth.js, Prisma, pg-boss, or any other infrastructure in this story — that is Story 1.2 and 1.3
- **Do NOT** implement `HealthScoreWidget` logic — just the empty slot placeholder div
- **Do NOT** implement user menu logic — just the placeholder `data-testid="user-menu-slot"` div
- **Do NOT** add any Server Action auth checks — no auth exists yet
- **Do NOT** add `AGENTS.md` to `.gitignore` — it should be committed per architecture spec

### shadcn/ui Init Notes

When running `npx shadcn@latest init`, it will:
- Detect Tailwind v4 and skip generating `tailwind.config.js` ✓
- Create `src/components/ui/` directory ✓
- Update `globals.css` to add shadcn's CSS variables ⚠️

**After running shadcn init**, replace the shadcn-generated `globals.css` content with the full FollowCV token set from Task 2. The shadcn defaults use generic variable names (`--primary`, `--background`) that conflict with the architecture's explicit token names. Our token set uses the names from the UX spec.

### TypeScript Strict Mode

`create-next-app` generates `tsconfig.json` with `"strict": true` already. Do not loosen this. All TypeScript errors must be fixed, not suppressed.

### Source: Architecture Compliance

- Project structure: [architecture.md — Complete Project Directory Structure]
- Naming conventions: [architecture.md — File & Directory Naming]
- Testing framework: [architecture.md — Testing: Vitest + Testing Library + Playwright]
- Design token names: [ux-design-specification.md — Color System]
- Font spec: [ux-design-specification.md — Typography System]
- Layout spec: [ux-design-specification.md — Spacing & Layout Foundation]
- AR1 (init command): [epics.md — Additional Requirements]
- UX-DR1 (Tailwind v4 @theme): [epics.md — UX Design Requirements]
- UX-DR2 (Inter self-hosted): [epics.md — UX Design Requirements]
- UX-DR13 (dashboard shell): [epics.md — UX Design Requirements]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `passWithNoTests: true` added to `vitest.config.ts` — Vitest exits code 1 with no test files by default; this is expected behaviour for Story 1.1 which has no business logic to test yet.
- shadcn `init` overwrites `globals.css` with its own variables — replaced with FollowCV token set while preserving the shadcn `:root` variables that shadcn components depend on.
- `create-next-app` generates Geist font setup — removed in favour of self-hosted Inter via `@font-face` in `globals.css`.

### Completion Notes List

- Next.js 16.2.4, Tailwind CSS 4.2.4, shadcn 4.6.0 installed.
- All FollowCV design tokens defined in `globals.css` `@theme inline` block alongside shadcn bridge tokens.
- Inter v4.1 variable font self-hosted at `public/fonts/InterVariable.woff2` (344KB).
- Dashboard shell at `src/app/(dashboard)/layout.tsx` with 256px sidebar, placeholder health-score-slot, Board/Settings nav links, user-menu-slot.
- `Providers` client component created as extension point for auth/toast wrappers.
- GitHub Actions CI with three jobs (typecheck / lint / test), working-directory set to `followcv/`.
- All verifications passed: `tsc --noEmit` ✓, `eslint` ✓, `vitest run` ✓, `next build` ✓.

### File List

- `followcv/package.json` — updated (test/test:run scripts)
- `followcv/vitest.config.ts` — new
- `followcv/src/test-setup.ts` — new
- `followcv/src/app/globals.css` — replaced (FollowCV tokens + shadcn bridge)
- `followcv/src/app/layout.tsx` — updated (removed Geist, added Providers)
- `followcv/src/app/(dashboard)/layout.tsx` — new (256px sidebar shell)
- `followcv/src/app/(dashboard)/board/page.tsx` — new (placeholder)
- `followcv/src/components/shared/Providers.tsx` — new
- `followcv/public/fonts/InterVariable.woff2` — new (Inter v4.1 variable font)
- `.github/workflows/ci.yml` — new (3-job CI pipeline)
