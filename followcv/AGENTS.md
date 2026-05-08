# AGENTS.md — FollowCV Harness

<!-- BEGIN:nextjs-agent-rules -->
## ⚠️ This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data.
**Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.**
<!-- END:nextjs-agent-rules -->

---

## 1. How to Read This File

This file is the **harness** — the operating rules that wrap every agent in this project.
Read it fully before acting. It supersedes any general knowledge you have about Next.js, Prisma, or OAuth.

Project-specific constraints (Neon HTTP limits, cache pattern, Server Action contract, Vercel Blob rules, Gmail OAuth) live in [`__project-context.md__`](__project-context.md__). That file is **mandatory reading** before touching any server-side code.

---

## 2. Agent Roster & Ownership

| Agent | Persona | Owns | Never Does |
|-------|---------|------|------------|
| **John** `bmad-agent-pm` | Product Manager | PRD, requirements, acceptance criteria | Architecture decisions, code |
| **Mary** `bmad-agent-analyst` | Business Analyst | Strategic analysis, edge case mapping, constraint documentation | Implementation details |
| **Winston** `bmad-agent-architect` | Architect | System design, ADRs, updating `architecture.md` | Writing production code |
| **Sally** `bmad-agent-ux-designer` | UX Designer | User flows, component specs, UX copy | Backend logic, DB schema |
| **Amelia** `bmad-agent-dev` | Senior Developer | Story implementation, tests, PR-ready code | Changing requirements, skipping tests |
| **Paige** `bmad-agent-tech-writer` | Tech Writer | Docs, changelogs, `project-context.md` updates | Code, architecture decisions |

**Rule:** An agent must not act outside its ownership column. If a blocker requires crossing lanes, it must surface it as a handoff request (see §6).

---

## 3. Canonical Workflow

```
John (PRD)
  → Mary (edge cases + constraints)
    → Winston (architecture + ADR)
      → Sally (UX spec per story)
        → Amelia (implement + test)
          → Paige (document deltas)
            → Amelia (incorporate doc feedback if any)
```

**Brownfield rule:** For changes to existing features, Winston runs **Code-First** — read and understand the existing implementation before proposing changes. Never propose architecture that contradicts `project-context.md`.

---

## 4. File-Backed State

Work state lives in files, not in conversation memory. This survives context resets and session restarts.

```
_bmad-output/
  planning-artifacts/       ← John + Mary + Winston outputs
    prd.md
    architecture.md         ← Winston owns; keep in sync with reality
  ux-artifacts/             ← Sally outputs
  implementation-artifacts/ ← Amelia outputs (one file per story)
    {story-id}.md
    deferred-work.md        ← known debt, explicitly deferred decisions
  docs/                     ← Paige outputs
```

**Before starting any story**, Amelia must:
1. Read the story file in `implementation-artifacts/`
2. Read `__project-context.md__`
3. Read `deferred-work.md` for relevant open items
4. Check if `architecture.md` matches reality — if it doesn't, flag to Winston before coding

---

## 5. Completion Gates

A phase is only **done** when its gate is fully satisfied. Declaring done without passing the gate is a harness violation.

### John — Story is ready for dev
- [ ] Acceptance criteria are written as verifiable statements ("given / when / then" or equivalent)
- [ ] Each criterion maps to a specific user action, not a vibe
- [ ] No criterion requires reading John's mind to interpret

### Winston — Architecture is ready for implementation
- [ ] Decision does not use `prisma.$transaction()`, `updateMany`, `deleteMany`, or `createMany` (Neon HTTP constraint)
- [ ] Any new blob storage interaction follows the proxy pattern (no direct blob URLs exposed to client)
- [ ] Any new Server Action follows `ActionResult<T>` contract
- [ ] ADR written for any decision that contradicts an existing planning artifact

### Amelia — Story is ready for review
- [ ] All acceptance criteria have corresponding tests
- [ ] `npm test` (or `pnpm test`) passes with zero failures
- [ ] **For UI-affecting stories: visual verification done.** Either an E2E spec under `e2e/*.spec.ts` exercises the new path, or Amelia drove the change with the Playwright MCP and attached a screenshot/trace to the story. Code-only stories (services, schema, jobs) are exempt.
- [ ] No `revalidateTag` calls added (use `router.refresh()` — see `project-context.md`)
- [ ] No `prisma.$transaction()`, `updateMany`, `deleteMany` in new code
- [ ] No blob URL returned from a Server Action or exposed to the client
- [ ] `GmailToken` writes go only through `gmail-token-service.ts`
- [ ] If schema adds a model with blob URLs: `deleteAccount()` cleanup extended
- [ ] `deferred-work.md` updated if any shortcuts were taken

### Paige — Docs are ready
- [ ] `project-context.md` updated if implementation revealed a new "gotcha" not already documented
- [ ] Any architectural drift (reality vs `architecture.md`) flagged to Winston

---

## 6. Failure & Handoff Protocol

When an agent hits a blocker, it **stops and surfaces** — it does not guess, invent, or silently proceed.

### Blocker types

| Type | What to do |
|------|-----------|
| **Constraint conflict** — new requirement contradicts `project-context.md` | Stop. Raise to Winston + John. Do not work around it silently. |
| **Ambiguous acceptance criterion** | Stop. Return to John with the specific question. Do not interpret charitably and proceed. |
| **Test failure after 2 attempts** | Stop. Document exact error + what was tried in the story file. Raise to Winston if architectural, John if requirements. |
| **Architecture.md contradicts reality** | Stop. Flag to Winston before writing any code. |
| **Missing env var / infra** | Stop. Document in story file. Do not stub or hardcode. |

### Handoff format
When passing work forward, the handing-off agent writes to the relevant `_bmad-output/` file:

```
## Handoff from [Agent] to [Agent] — [date]
### What was completed
### Open questions / blockers for next agent
### Files changed
### Deferred items (added to deferred-work.md? yes/no)
```

---

## 7. The Evaluator Loop (Amelia)

After implementing a story, Amelia runs the evaluator loop before declaring done:

```
1. Run tests → if any fail, fix and re-run (max 2 self-correction attempts)
2. If still failing after 2 attempts → stop, document, escalate (see §6)
3. Check completion gate (§5) line by line
4. If gate passes → mark story done, write handoff note
5. If gate reveals a gap → fix the gap, re-run tests, re-check gate
```

**Narrowing rule:** Fix the specific failing test. Do not refactor surrounding code unless the test failure directly requires it. Scope creep during the evaluator loop is a harness violation.

---

## 8. Project-Specific Hard Rules

These are non-negotiable. Any agent that violates these has produced invalid output regardless of how correct it looks otherwise.

### Database (Neon HTTP — no transactions)
```ts
// ❌ NEVER
prisma.$transaction(...)
prisma.model.updateMany(...)
prisma.model.deleteMany(...)
prisma.model.createMany(...) // multiple rows

// ✅ ALWAYS — ownership-scoped single-row operations
const owned = await prisma.model.findFirst({ where: { id, userId } })
if (!owned) return { data: null, error: "Not found" }
await prisma.model.update({ where: { id: owned.id }, data: { ... } })
```

### Cache invalidation
```ts
// ❌ NEVER
revalidateTag(...)   // tests assert this is NOT called

// ✅ ALWAYS — from the calling Client Component on success
router.refresh()
```

### Server Actions
```ts
// Every action returns this shape, never throws
type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

// Auth is mandatory on every action
const session = await auth()
if (!session?.user?.id) return { data: null, error: "Unauthorized" }
// All DB reads/writes scoped to session.user.id
```

### Vercel Blob (private store)
```ts
// ❌ NEVER
access: "public"           // store is private — returns bad_request
onUploadCompleted: ...     // hangs forever in local dev
return blobUrl             // never expose blob URL or s3Key to client
// Direct browser navigation to blob URL → 403

// ✅ ALWAYS
access: "private"          // on upload
// All reads proxied through same-origin route handler
// See: src/app/api/cv/[id]/file/route.ts as reference
```

### Gmail OAuth
```ts
// ❌ NEVER
if (session.user.gmailConnected) { ... }  // stale JWT flag — cosmetic only

// ✅ ALWAYS — read from DB
const token = await prisma.gmailToken.findFirst({ where: { userId } })

// GmailToken writes — ONLY through:
import { setGmailToken } from "@/lib/services/gmail-token-service"

// Tests: mock the DB row, never set session.user.gmailConnected = true
```

### Account deletion
Any new schema model that stores blob URLs **must** extend `deleteAccount()` in `src/lib/account/service.ts` to collect and `del()` those URLs before the DB cascade.

### Browser automation
```
# ❌ NEVER commit
e2e/.auth/                 # storageState files contain real session cookies
playwright-report/         # noisy test artifacts
test-results/              # noisy test artifacts

# ✅ ALWAYS
# E2E tests use baseURL http://localhost:3000 and rely on Playwright's
# webServer config to auto-spawn `npm run dev`. Do not hardcode URLs.
# Tests live in e2e/*.spec.ts (NOT *.test.ts — that's vitest).
```

---

## 9. Browser Automation — Playwright + MCP

The harness ships with two browser-driving capabilities. Pick the right one for the job — they are not interchangeable.

### 9.1 Playwright as a test framework — durable specs

| Where | What |
|-------|------|
| `followcv/playwright.config.ts` | Test runner config. Auto-spawns `next dev` via `webServer`. |
| `followcv/e2e/*.spec.ts` | E2E specs. **`.spec.ts` only** — Vitest owns `.test.ts(x)`. |
| `npm run test:e2e` | Headless run. Uses `chromium-headless-shell`. |
| `npm run test:e2e:ui` | Interactive UI mode for authoring tests locally. |
| `npm run test:e2e:report` | Open the last HTML report. |

Use this for: golden-path verification that should run on every PR, regression coverage of bugs we've already fixed, and any guarantee we want to keep enforcing without re-reasoning.

### 9.2 Playwright MCP server — interactive verification

The project's `.mcp.json` (at repo root, version-controlled) exposes the `@playwright/mcp` server to every Claude session opened in this repo, including subagents. The MCP gives the agent tools to launch a browser, click, fill, screenshot, and inspect.

Use this for: ad-hoc "does this UI actually work" checks during a story, debugging a failing E2E spec, capturing a screenshot for a PR description, exploring a flow before writing the durable test.

**Rule:** anything an MCP session proves is **not** a regression test. If a finding from an MCP session matters for future correctness, it must be encoded as an `e2e/*.spec.ts` before the story ships.

### 9.3 Auth in E2E — current state

Smoke tests target unauthenticated routes only (`/`, `/login`, dashboard-redirects). Authenticated coverage is gated on a `storageState.json` fixture captured from a manual Google sign-in. **Tracked as a deferred item in `_bmad-output/implementation-artifacts/deferred-work.md`.** Do not stub auth or hardcode session cookies in tests in the meantime.

### 9.4 Owner

E2E tests fall under **Amelia's** ownership (story implementation). The Playwright MCP is available to **every agent** for verification — Sally screenshot-checking a UX flow, Winston probing a deployed change, Paige verifying a doc'd behaviour. Only Amelia commits durable specs.

---

## 10. Known Naming Traps

| Name | What it looks like | What it actually is |
|------|--------------------|---------------------|
| `CvVersion.s3Key` | An S3 object key | A Vercel Blob URL (legacy name — do not rename without a coordinated migration) |
| `GmailToken.refreshToken` | A plaintext refresh token | AES-256-GCM ciphertext: `base64(iv \|\| ciphertext \|\| authTag)` |
| `architecture.md` in `_bmad-output/planning-artifacts/` | The source of truth | A historical artifact — `project-context.md` overrides it where they conflict |
| `session.user.gmailConnected` | Auth entitlement | UI hint only — up to 30 days stale |

---

## 11. What to Do When You're Unsure

1. **Re-read `project-context.md`** — the answer is probably there
2. **Check `deferred-work.md`** — it might be a known open issue
3. **Check the reference implementation** — the file paths in `project-context.md` point to working examples
4. **Stop and surface** — an explicit blocker is better than a silent wrong assumption

Do not proceed on a guess. Do not make the smallest change that "might work." Surface the uncertainty.