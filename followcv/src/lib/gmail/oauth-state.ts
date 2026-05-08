/**
 * Cookie name shared between the Gmail OAuth start action and the
 * callback Route Handler. Lives in a non-`"use server"` module so it can
 * be exported alongside the runtime cookie reads (Next.js forbids
 * non-function exports from Server Action modules).
 */
export const GMAIL_OAUTH_STATE_COOKIE = "gmail_oauth_state"
