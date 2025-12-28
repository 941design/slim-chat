/**
 * Certificate Bypass Module
 *
 * Provides functionality to disable TLS certificate validation for development
 * scenarios (expired certs, self-signed certificates on dev servers).
 *
 * WARNING: This should only be enabled in development environments.
 * Never enable in production as it disables all certificate security checks.
 */

import { session } from 'electron';
import { log } from './logging';

/**
 * Configuration options for certificate bypass
 */
export interface CertificateBypassConfig {
  /** Config file setting for ignoring cert errors */
  configIgnoreCertErrors?: boolean;
  /** Environment variable value for NOSTLING_IGNORE_CERT_ERRORS */
  envIgnoreCertErrors?: string;
}

/**
 * Determines if certificate errors should be bypassed based on config and environment.
 *
 * @param config - Configuration options
 * @returns true if certificate errors should be bypassed
 */
export function shouldBypassCertificateErrors(config: CertificateBypassConfig): boolean {
  return config.envIgnoreCertErrors === 'true' || config.configIgnoreCertErrors === true;
}

/**
 * Configures Electron session to bypass TLS certificate verification.
 *
 * When enabled, ALL certificates are accepted including:
 * - Expired certificates
 * - Self-signed certificates
 * - Certificates with hostname mismatch
 *
 * @param config - Configuration options
 * @returns true if bypass was enabled, false otherwise
 */
export function configureCertificateBypass(config: CertificateBypassConfig): boolean {
  const shouldBypass = shouldBypassCertificateErrors(config);

  if (shouldBypass) {
    log('warn', 'Certificate error bypass is enabled - TLS certificate validation is disabled');
    session.defaultSession.setCertificateVerifyProc((_request, callback) => {
      // Accept all certificates (0 = OK)
      callback(0);
    });
    return true;
  }

  return false;
}
