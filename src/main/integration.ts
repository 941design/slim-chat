/**
 * Integration module for coordinating update verification flow
 *
 * This module integrates security verification with update management.
 * Coordinates manifest fetching, verification, and update state broadcasting.
 */

import { UpdateDownloadedEvent } from 'electron-updater';
import { SignedManifest } from '../shared/types';
import { verifyManifest } from './security/verify';
import { log } from './logging';
import { isDevMode } from './dev-env';
import { validateUpdateUrl } from './update/url-validation';

/**
 * Sanitize error messages for production (FR4: Error Message Sanitization)
 * EXPORTED for use in index.ts error handlers
 *
 * CONTRACT:
 *   Inputs:
 *     - error: Error object or unknown error
 *     - isDev: boolean flag indicating dev mode (allows verbose errors)
 *
 *   Outputs:
 *     - Error object with sanitized message (production) or original message (dev)
 *
 *   Invariants:
 *     - Dev mode: preserve full error details for debugging
 *     - Production mode: hide implementation details (HTTP status codes, JSON parse errors, field names)
 *
 *   Properties:
 *     - Security: production errors don't leak internal implementation details
 *     - Debuggability: dev mode preserves full error context
 *     - User-friendly: production errors are generic and non-technical
 *
 *   Algorithm:
 *     1. If isDev is true:
 *        - Return error as-is (preserve full details for debugging)
 *
 *     2. Extract error message:
 *        - If error is Error instance: use error.message
 *        - Otherwise: use String(error)
 *
 *     3. Sanitize based on error type (pattern matching on message):
 *        a. HTTP status codes (e.g., "status 404", "status 500"):
 *           - Replace with: "Failed to fetch manifest from server"
 *
 *        b. JSON parse errors (contains "parse", "JSON", "SyntaxError"):
 *           - Replace with: "Manifest format is invalid"
 *
 *        c. Field validation errors (contains "field", "required", "missing"):
 *           - Replace with: "Manifest validation failed"
 *
 *        d. URL errors (contains "Invalid URL", "protocol"):
 *           - Replace with: "Invalid update source configuration"
 *
 *        e. Timeout errors (contains "timed out", "timeout"):
 *           - Preserve: "Manifest fetch timed out" (no implementation details leaked)
 *
 *        f. Network/Offline errors (ENOTFOUND, ECONNREFUSED, ETIMEDOUT, EAI_AGAIN, net::ERR_*, "fetch failed", "network error"):
 *           - Replace with: "Network is offline"
 *           - These indicate the user is offline or the server is unreachable
 *
 *        g. Squirrel.Mac code signature errors (contains "code signature", "designated requirement", "did not pass validation"):
 *           - Replace with: "macOS code signature verification failed (Squirrel.Mac)"
 *           - This distinguishes electron-updater's macOS code signing errors from our RSA verification
 *
 *        h. Custom RSA signature errors (contains "signature" but not caught above):
 *           - Replace with: "Manifest signature verification failed"
 *
 *        i. Otherwise:
 *           - Generic fallback: "Update verification failed"
 *
 *     4. Return new Error with sanitized message
 *
 *   Examples:
 *     Dev mode (isDev = true):
 *       sanitizeError(Error("Manifest request failed with status 404"), true)
 *       → Error("Manifest request failed with status 404")  // preserved
 *
 *     Production mode (isDev = false):
 *       sanitizeError(Error("Manifest request failed with status 404"), false)
 *       → Error("Failed to fetch manifest from server")
 *
 *       sanitizeError(Error("Failed to parse manifest JSON: Unexpected token"), false)
 *       → Error("Manifest format is invalid")
 *
 *       sanitizeError(Error("Missing required manifest fields: artifacts, signature"), false)
 *       → Error("Manifest validation failed")
 *
 *       sanitizeError(Error("Invalid manifest URL: Invalid URL"), false)
 *       → Error("Invalid update source configuration")
 *
 *       sanitizeError(Error("Manifest fetch timed out after 30000ms"), false)
 *       → Error("Manifest fetch timed out after 30000ms")  // preserved (no leak)
 *
 * IMPLEMENTATION NOTE:
 *   - Use pattern matching (string.includes() or regex) to identify error types
 *   - Preserve stack trace if available
 *   - Consider using isDev = Boolean(process.env.VITE_DEV_SERVER_URL) at call sites
 */
export function sanitizeError(error: unknown, isDev: boolean): Error {
  // Extract error message
  const message = error instanceof Error ? error.message : String(error);

  // Dev mode: preserve full error details for debugging
  if (isDev) {
    if (error instanceof Error) {
      return error;
    }
    return new Error(message);
  }

  // Production mode: sanitize based on error type patterns
  const lowerMessage = message.toLowerCase();

  // HTTP status codes: "status 404", "status 500", etc.
  if (/status\s+\d{3}/.test(message)) {
    return new Error('Failed to fetch manifest from server');
  }

  // JSON parse errors: contains "parse", "JSON", "SyntaxError"
  if (lowerMessage.includes('parse') || lowerMessage.includes('json') || lowerMessage.includes('syntaxerror')) {
    return new Error('Manifest format is invalid');
  }

  // Field validation errors: contains "field", "required", "missing"
  if (
    lowerMessage.includes('field') ||
    lowerMessage.includes('required') ||
    lowerMessage.includes('missing')
  ) {
    return new Error('Manifest validation failed');
  }

  // URL errors: contains "Invalid URL", "protocol", "cannot be empty"
  if (lowerMessage.includes('invalid url') || lowerMessage.includes('protocol') || lowerMessage.includes('cannot be empty')) {
    return new Error('Invalid update source configuration');
  }

  // Timeout errors: preserve with generic message (no implementation details leaked)
  if (lowerMessage.includes('timed out') || lowerMessage.includes('timeout')) {
    return new Error('Manifest fetch timed out');
  }

  // Network/Offline errors: DNS resolution, connection refused, Chromium network errors
  // These indicate the user is offline or the server is unreachable
  // Patterns: ENOTFOUND, ECONNREFUSED, ETIMEDOUT (connect), EAI_AGAIN, net::ERR_*, "fetch failed", "network error"
  if (
    lowerMessage.includes('enotfound') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('etimedout') ||
    lowerMessage.includes('eai_again') ||
    lowerMessage.includes('net::err_') ||
    lowerMessage.includes('fetch failed') ||
    lowerMessage.includes('network error')
  ) {
    return new Error('Network is offline');
  }

  // Squirrel.Mac / macOS code signature errors (from electron-updater on macOS)
  // Pattern: "Code signature at URL ... did not pass validation", "designated requirement"
  // These are different from our custom RSA manifest signature verification
  // Bug report reference: bug-reports/0015-update-signature-verification-after-restart-report.md
  if (
    lowerMessage.includes('code signature') ||
    lowerMessage.includes('designated requirement') ||
    lowerMessage.includes('did not pass validation')
  ) {
    return new Error('macOS code signature verification failed (Squirrel.Mac)');
  }

  // Custom RSA manifest signature verification errors (our verification)
  // This catches "Manifest signature verification failed" from verifyManifest()
  if (lowerMessage.includes('signature')) {
    return new Error('Manifest signature verification failed');
  }

  // Hash mismatch errors: preserve category
  if (lowerMessage.includes('hash')) {
    return new Error('Downloaded file integrity check failed');
  }

  // Version validation errors: preserve category
  if (lowerMessage.includes('version')) {
    return new Error('Manifest version validation failed');
  }

  // Platform/artifact errors: preserve category
  if (lowerMessage.includes('artifact') || lowerMessage.includes('platform')) {
    return new Error('No compatible update artifact found');
  }

  // Otherwise: generic fallback
  return new Error('Update verification failed');
}

/**
 * Construct manifest URL for update verification
 *
 * CONTRACT:
 *   Inputs:
 *     - publishConfig: object with optional fields:
 *       - owner: GitHub username or organization
 *       - repo: repository name
 *     - devUpdateSource: optional string (dev mode override URL)
 *
 *   Outputs:
 *     - string: manifest URL
 *     - throws Error if publishConfig incomplete and no devUpdateSource
 *
 *   Invariants:
 *     - Production: always uses /latest/download/ path (cross-version discovery)
 *     - Dev mode: derives URL from devUpdateSource
 *     - URL format matches electron-updater GitHub provider expectations
 *
 *   Properties:
 *     - Cross-version discovery: production URL independent of current version
 *     - Dev mode flexibility: supports custom URLs including file://
 *     - GitHub convention: follows electron-updater GitHub provider pattern
 *
 *   Algorithm:
 *     1. If devUpdateSource is defined and non-empty:
 *        a. If devUpdateSource ends with '/':
 *           - Return devUpdateSource + 'manifest.json'
 *        b. Else:
 *           - Return devUpdateSource + '/manifest.json'
 *
 *     2. Validate publishConfig (production mode):
 *        a. Extract owner = publishConfig.owner?.trim()
 *        b. Extract repo = publishConfig.repo?.trim()
 *        c. If owner is empty or undefined, throw Error("GitHub owner not configured")
 *        d. If repo is empty or undefined, throw Error("GitHub repo not configured")
 *
 *     3. Construct production URL:
 *        - Return `https://github.com/${owner}/${repo}/releases/latest/download/manifest.json`
 *        - NOTE: /latest/download/ path (NOT version-specific)
 *
 *   Examples:
 *     Production mode:
 *       constructManifestUrl({ owner: "941design", repo: "nostling" }, undefined)
 *       → "https://github.com/941design/nostling/releases/latest/download/manifest.json"
 *
 *     Dev mode with GitHub release:
 *       constructManifestUrl({}, "https://github.com/941design/nostling/releases/download/1.0.0")
 *       → "https://github.com/941design/nostling/releases/download/1.0.0/manifest.json"
 *
 *     Dev mode with local file:
 *       constructManifestUrl({}, "file://./test-manifests/1.0.0")
 *       → "file://./test-manifests/1.0.0/manifest.json"
 */
export function constructManifestUrl(
  publishConfig: { owner?: string; repo?: string },
  devUpdateSource?: string
): string {
  // Dev mode: use devUpdateSource as base URL
  if (devUpdateSource) {
    if (devUpdateSource.endsWith('/')) {
      return devUpdateSource + 'manifest.json';
    } else {
      return devUpdateSource + '/manifest.json';
    }
  }

  // Production mode: validate publishConfig and construct URL
  const owner = publishConfig.owner?.trim();
  const repo = publishConfig.repo?.trim();

  if (!owner) {
    throw new Error('GitHub owner not configured');
  }

  if (!repo) {
    throw new Error('GitHub repo not configured');
  }

  // Production: use /latest/download/ for cross-version discovery
  return `https://github.com/${owner}/${repo}/releases/latest/download/manifest.json`;
}

/**
 * Fetch manifest from URL
 *
 * CONTRACT (FR2: File Protocol Support):
 *   Inputs:
 *     - manifestUrl: HTTPS URL to manifest.json (or file:// URL if allowFileProtocol is true)
 *     - timeoutMs: optional timeout in milliseconds (default: 30000)
 *     - allowFileProtocol: optional boolean flag to allow file:// URLs (default: false)
 *
 *   Outputs:
 *     - promise resolving to: SignedManifest object
 *     - promise rejecting with: Error if fetch fails, URL invalid, or JSON invalid
 *
 *   Invariants:
 *     - HTTPS-only in production (allowFileProtocol = false)
 *     - file:// URLs only allowed when allowFileProtocol = true (dev mode)
 *     - Uses fetch API for HTTP/file requests
 *     - Validates HTTP status is 2xx
 *     - Parses response as JSON
 *     - Timeout mechanism prevents indefinite hangs
 *
 *   Properties:
 *     - Security: production mode enforces HTTPS-only
 *     - Dev flexibility: file:// URLs enabled in dev mode for local testing
 *     - Timeout protection: operations abort after timeoutMs
 *     - Network-dependent: requires connectivity (except file://)
 *     - Synchronous parsing: JSON parsed immediately after fetch
 *
 *   Algorithm:
 *     1. Validate manifest URL:
 *        - Call validateManifestUrl(manifestUrl, allowFileProtocol)
 *        - This will throw if URL is invalid or protocol disallowed
 *
 *     2. Setup timeout mechanism:
 *        - Create AbortController instance
 *        - Set timeout to abort after timeoutMs
 *
 *     3. Try block:
 *        a. Fetch URL using fetch(manifestUrl, { signal: controller.signal, headers: { 'Cache-Control': 'no-cache' } })
 *        b. Check response.ok (status 2xx):
 *           - If not ok, throw Error with status code
 *        c. Try to parse JSON: await response.json()
 *           - Catch parse errors and wrap with descriptive message
 *        d. Validate manifest structure: validateManifestStructure(data)
 *        e. Return data as SignedManifest
 *
 *     4. Catch block:
 *        - If AbortError: throw timeout error
 *        - Otherwise: propagate original error
 *
 *     5. Finally block:
 *        - Clear timeout to prevent memory leak
 *
 *   Examples:
 *     Production mode (HTTPS only):
 *       fetchManifest("https://github.com/.../manifest.json", 30000, false)
 *       → Success if manifest exists
 *       fetchManifest("file:///tmp/manifest.json", 30000, false)
 *       → Error: "Manifest URL must use HTTPS protocol"
 *
 *     Dev mode (file:// allowed):
 *       fetchManifest("file:///tmp/test-manifests/1.0.0/manifest.json", 30000, true)
 *       → Success if file exists and valid JSON
 *       fetchManifest("https://github.com/.../manifest.json", 30000, true)
 *       → Success (HTTPS still allowed in dev mode)
 *
 *   Error Conditions:
 *     - Invalid URL: reject with URL parse error
 *     - Protocol violation: reject with "Manifest URL must use HTTPS protocol" (production)
 *     - Network failure: reject with fetch error
 *     - HTTP error (4xx, 5xx): reject with status code
 *     - Invalid JSON: reject with parse error
 *     - Timeout: reject with "Manifest fetch timed out after {timeoutMs}ms"
 *
 * IMPLEMENTATION NOTE:
 *   FR2 specification requires file:// support for dev mode testing.
 *   Pass allowFileProtocol=true ONLY when devUpdateSource is set.
 *   Call site (index.ts): `allowFileProtocol: Boolean(devConfig.devUpdateSource)`
 */
export async function fetchManifest(
  manifestUrl: string,
  timeoutMs: number = 30000,
  allowFileProtocol: boolean = false
): Promise<SignedManifest> {
  validateManifestUrl(manifestUrl, allowFileProtocol);

  // CRITICAL: Timeout mechanism to prevent indefinite hangs (FR4)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(manifestUrl, {
      headers: {
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const rawError = new Error(`Manifest request failed with status ${response.status}`);
      throw sanitizeError(rawError, isDevMode());
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      const rawError = new Error(
        `Failed to parse manifest JSON: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      throw sanitizeError(rawError, isDevMode());
    }

    validateManifestStructure(data);
    return data as SignedManifest;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Manifest fetch timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validate manifest URL protocol
 *
 * CONTRACT (FR2: File Protocol Support):
 *   Inputs:
 *     - url: string URL to validate
 *     - allowFileProtocol: optional boolean flag to allow file:// (default: false)
 *
 *   Outputs:
 *     - void if URL is valid
 *     - throws Error if URL is invalid or protocol disallowed
 *
 *   Invariants:
 *     - Production mode (allowFileProtocol = false): only https:// allowed
 *     - Dev mode (allowFileProtocol = true): https:// and file:// allowed
 *     - Malformed URLs always rejected
 *
 *   Properties:
 *     - Security: production mode enforces HTTPS-only
 *     - Flexibility: dev mode allows file:// for local testing
 *     - Fail-fast: throws immediately on invalid input
 *
 *   Algorithm:
 *     1. Try to parse URL using URL constructor:
 *        - If parse fails, catch and throw "Invalid manifest URL: {error message}"
 *
 *     2. Check protocol (urlObj.protocol):
 *        a. If protocol is 'https:':
 *           - Valid in both production and dev mode → return (success)
 *
 *        b. If protocol is 'file:':
 *           - If allowFileProtocol is true → return (success)
 *           - If allowFileProtocol is false → throw "Manifest URL must use HTTPS protocol"
 *
 *        c. Otherwise (http:, ftp:, etc.):
 *           - throw "Manifest URL must use HTTPS protocol"
 *
 *   Examples:
 *     Production mode (allowFileProtocol = false):
 *       validateManifestUrl("https://github.com/owner/repo/manifest.json", false) → void (success)
 *       validateManifestUrl("file:///tmp/manifest.json", false) → Error: "Manifest URL must use HTTPS protocol"
 *       validateManifestUrl("http://example.com/manifest.json", false) → Error: "Manifest URL must use HTTPS protocol"
 *
 *     Dev mode (allowFileProtocol = true):
 *       validateManifestUrl("file:///tmp/manifest.json", true) → void (success)
 *       validateManifestUrl("https://github.com/owner/repo/manifest.json", true) → void (success)
 *       validateManifestUrl("http://example.com/manifest.json", true) → Error: "Manifest URL must use HTTPS protocol"
 *
 *   Error Conditions:
 *     - Malformed URL: "Invalid manifest URL: {details}"
 *     - Disallowed protocol: "Manifest URL must use HTTPS protocol"
 *
 * IMPLEMENTATION NOTE:
 *   Must accept optional allowFileProtocol parameter.
 *   Default value should be false (production-safe default).
 *   Update fetchManifest to pass this parameter through.
 */
function validateManifestUrl(url: string, allowFileProtocol: boolean = false): void {
  try {
    validateUpdateUrl(url, {
      allowFileProtocol,
      allowHttp: false, // Never allow http for manifest URLs
      context: 'Manifest URL',
    });
  } catch (err) {
    // Sanitize any validation errors before throwing
    throw sanitizeError(err, isDevMode());
  }
}

function validateManifestStructure(data: unknown): void {
  if (!data || typeof data !== 'object') {
    throw new Error('Manifest must be a valid JSON object');
  }

  const manifest = data as Record<string, unknown>;

  const requiredFields = ['version', 'artifacts', 'signature', 'createdAt'];
  const missingFields = requiredFields.filter((field) => !(field in manifest));

  if (missingFields.length > 0) {
    throw new Error(`Missing required manifest fields: ${missingFields.join(', ')}`);
  }

  if (typeof manifest.version !== 'string') {
    throw new Error('Manifest field "version" must be a string');
  }

  if (!Array.isArray(manifest.artifacts)) {
    throw new Error('Manifest field "artifacts" must be an array');
  }

  if (typeof manifest.signature !== 'string') {
    throw new Error('Manifest field "signature" must be a string');
  }

  if (typeof manifest.createdAt !== 'string') {
    throw new Error('Manifest field "createdAt" must be a string');
  }
}

/**
 * Verify downloaded update (orchestrates full verification flow)
 *
 * CONTRACT (FR2: File Protocol Support):
 *   Inputs:
 *     - downloadEvent: UpdateDownloadedEvent from electron-updater
 *     - currentVersion: current app version string
 *     - currentPlatform: platform identifier ('darwin' | 'linux' | 'win32')
 *     - publicKeyPem: RSA public key in PEM format
 *     - manifestUrl: URL to fetch manifest from
 *     - allowFileProtocol: optional boolean flag to allow file:// URLs (default: false)
 *
 *   Outputs:
 *     - promise resolving to: { verified: true } if all checks pass
 *     - promise rejecting with: Error containing reason if any check fails
 *
 *   Invariants:
 *     - All verification steps must pass
 *     - Manifest fetched before verification
 *     - Downloaded file path extracted from event
 *     - File protocol only allowed when explicitly enabled
 *
 *   Properties:
 *     - Completeness: fetches manifest and verifies all aspects
 *     - Delegation: uses verifyManifest for cryptographic checks
 *     - Logging: logs fetch and verification steps
 *     - Security: file:// protocol controlled by explicit flag
 *
 *   Algorithm:
 *     1. Log: "Fetching manifest from {manifestUrl}"
 *     2. Fetch manifest: await fetchManifest(manifestUrl, 30000, allowFileProtocol)
 *     3. Extract downloaded file path from downloadEvent
 *        - Try (downloadEvent as any).downloadedFile
 *        - Fallback to downloadEvent.downloadedFile
 *        - If missing, throw Error("Downloaded file path missing")
 *     4. Verify manifest: await verifyManifest(
 *          manifest,
 *          filePath,
 *          currentVersion,
 *          currentPlatform,
 *          publicKeyPem
 *        )
 *     5. Log: "Manifest verified for version {manifest.version}"
 *     6. Return { verified: true }
 *
 *   Error Conditions:
 *     - Manifest fetch fails: propagate fetch error (includes protocol violations)
 *     - File path missing: throw descriptive error
 *     - Verification fails: propagate verification error
 *
 * IMPLEMENTATION NOTE:
 *   FR2 requires passing allowFileProtocol to fetchManifest.
 *   Call site (index.ts) should pass: allowFileProtocol: Boolean(devUpdateSource)
 */
export async function verifyDownloadedUpdate(
  downloadEvent: UpdateDownloadedEvent,
  currentVersion: string,
  currentPlatform: 'darwin' | 'linux' | 'win32',
  publicKeyPem: string,
  manifestUrl: string,
  allowFileProtocol: boolean = false
): Promise<{ verified: true }> {
  // Step 1: Log fetch start
  log('info', `Fetching manifest from ${manifestUrl}`);

  // Step 2: Fetch manifest
  let manifest: SignedManifest;
  try {
    manifest = await fetchManifest(manifestUrl, 30000, allowFileProtocol);
    log('info', `Manifest fetched successfully, version: ${manifest.version}`);
  } catch (err) {
    log('error', `Manifest fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }

  // Step 3: Extract downloaded file path from event
  const filePath =
    (downloadEvent as any).downloadedFile || downloadEvent.downloadedFile;

  if (!filePath) {
    log('error', 'Downloaded file path missing from update event');
    throw new Error('Downloaded file path missing');
  }
  log('info', `Downloaded file path: ${filePath}`);

  // Step 4: Verify manifest
  try {
    await verifyManifest(manifest, filePath, currentVersion, currentPlatform, publicKeyPem);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log('error', `Manifest verification failed at step: ${errorMsg}`);
    throw err;
  }

  // Step 5: Log verification success
  log('info', `Manifest verified for version ${manifest.version}`);

  // Step 6: Return success
  return { verified: true };
}
