/**
 * URL Sanitization for Avatar Pictures
 *
 * Protects against XSS attacks via malicious picture URLs.
 * Only allows http: and https: schemes.
 */

// Note: Using console.warn for renderer-safe logging (can't import main process logging)

/**
 * Sanitize picture URL to prevent XSS attacks
 *
 * CONTRACT:
 *   Inputs:
 *     - url: string | null | undefined (profile picture URL from untrusted source)
 *
 *   Outputs:
 *     - sanitized URL: string | null
 *       - null if input is null/undefined/empty
 *       - null if URL scheme is not http: or https:
 *       - original URL if scheme is http: or https:
 *
 *   Invariants:
 *     - Output never contains javascript:, data:, vbscript:, or other executable schemes
 *     - Output is either null or a valid http(s) URL
 *
 *   Properties:
 *     - Security: Rejects all non-http(s) schemes
 *     - Idempotent: sanitizePictureUrl(sanitizePictureUrl(url)) equals sanitizePictureUrl(url)
 *     - Null-safe: handles null/undefined inputs gracefully
 *
 *   Algorithm:
 *     1. If url is null, undefined, or empty string → return null
 *     2. Parse URL using browser URL API
 *     3. Check if protocol is 'http:' or 'https:'
 *     4. If yes → return original URL
 *     5. If no → log warning and return null
 *     6. If URL parsing fails → log warning and return null
 */
export function sanitizePictureUrl(url: string | null | undefined): string | null {
  // Handle null/undefined/empty
  if (!url || url.trim().length === 0) {
    return null;
  }

  try {
    // Parse URL to extract scheme
    const parsed = new URL(url);

    // Only allow http and https schemes
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url;
    }

    // Reject all other schemes (javascript:, data:, vbscript:, etc.)
    console.warn(`[url-sanitizer] Rejected unsafe picture URL with scheme: ${parsed.protocol}`);
    return null;
  } catch (error) {
    // Malformed URL
    console.warn(`[url-sanitizer] Rejected malformed picture URL: ${url}`);
    return null;
  }
}
