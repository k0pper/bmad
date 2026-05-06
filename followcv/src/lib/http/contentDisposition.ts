/**
 * Build an RFC 6266-compliant Content-Disposition header value.
 *
 * HTTP header values must be ByteStrings (each char ≤ 255). The user-supplied
 * filename can contain anything Unicode (em-dash, accented chars, emoji…) so
 * we emit two filename forms per RFC 6266 §4.1:
 *   - `filename="…"` — ASCII fallback for legacy clients.
 *   - `filename*=UTF-8''…` — UTF-8 percent-encoded for modern clients.
 *
 * Modern browsers (Chrome, Firefox, Safari, Edge) prefer `filename*` when
 * present and fall back to `filename` when not — so a CV named "CV — 2026"
 * preserves the em-dash on download in any current browser.
 */
export function buildContentDisposition(
  disposition: "inline" | "attachment",
  filename: string
): string {
  const ascii = filename
    .replace(/[\r\n"\\]/g, "_") // header-unsafe characters
    .replace(/[^\x20-\x7E]/g, "_") // any non-printable-ASCII → underscore

  const utf8 = encodeURIComponent(filename)

  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${utf8}`
}
