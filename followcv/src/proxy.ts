import { auth } from "@/lib/auth"

// Auth.js session guard for all routes. The authorized() callback in src/lib/auth/index.ts
// enforces: dashboard route protection, 24h idle timeout, and admin role (403).
export const proxy = auth

export const config = {
  matcher: [
    // Run proxy on everything except Auth.js API routes, static files, and images
    "/((?!api/auth|_next/static|_next/image|favicon.ico|fonts/).*)",
  ],
}
