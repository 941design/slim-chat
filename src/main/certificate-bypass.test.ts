/**
 * Certificate Bypass Tests
 *
 * Verifies that the ignoreCertErrors configuration parameter correctly controls
 * TLS certificate validation bypass in Electron's session.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fc from 'fast-check';

// Mock electron session before importing the module under test
const mockSetCertificateVerifyProc = jest.fn();
jest.mock('electron', () => ({
  session: {
    defaultSession: {
      setCertificateVerifyProc: mockSetCertificateVerifyProc,
    },
  },
}));

// Mock logging
const mockLog = jest.fn();
jest.mock('./logging', () => ({
  log: mockLog,
}));

import {
  shouldBypassCertificateErrors,
  configureCertificateBypass,
  CertificateBypassConfig,
} from './certificate-bypass';

describe('Certificate Bypass Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('shouldBypassCertificateErrors', () => {
    describe('Example-Based Tests', () => {
      it('returns false when both config and env are not set', () => {
        const config: CertificateBypassConfig = {};
        expect(shouldBypassCertificateErrors(config)).toBe(false);
      });

      it('returns true when config.ignoreCertErrors is true', () => {
        const config: CertificateBypassConfig = {
          configIgnoreCertErrors: true,
        };
        expect(shouldBypassCertificateErrors(config)).toBe(true);
      });

      it('returns false when config.ignoreCertErrors is false', () => {
        const config: CertificateBypassConfig = {
          configIgnoreCertErrors: false,
        };
        expect(shouldBypassCertificateErrors(config)).toBe(false);
      });

      it('returns true when NOSTLING_IGNORE_CERT_ERRORS env is "true"', () => {
        const config: CertificateBypassConfig = {
          envIgnoreCertErrors: 'true',
        };
        expect(shouldBypassCertificateErrors(config)).toBe(true);
      });

      it('returns false when NOSTLING_IGNORE_CERT_ERRORS env is "false"', () => {
        const config: CertificateBypassConfig = {
          envIgnoreCertErrors: 'false',
        };
        expect(shouldBypassCertificateErrors(config)).toBe(false);
      });

      it('returns true when either config or env enables bypass', () => {
        // Config true, env not set
        expect(shouldBypassCertificateErrors({ configIgnoreCertErrors: true })).toBe(true);

        // Config not set, env true
        expect(shouldBypassCertificateErrors({ envIgnoreCertErrors: 'true' })).toBe(true);

        // Both true
        expect(
          shouldBypassCertificateErrors({
            configIgnoreCertErrors: true,
            envIgnoreCertErrors: 'true',
          })
        ).toBe(true);

        // Config true, env false - config wins with OR logic
        expect(
          shouldBypassCertificateErrors({
            configIgnoreCertErrors: true,
            envIgnoreCertErrors: 'false',
          })
        ).toBe(true);
      });
    });

    describe('Property-Based Tests', () => {
      it('property: env value "true" always enables bypass regardless of config', () => {
        fc.assert(
          fc.property(fc.boolean(), (configValue) => {
            const config: CertificateBypassConfig = {
              configIgnoreCertErrors: configValue,
              envIgnoreCertErrors: 'true',
            };
            expect(shouldBypassCertificateErrors(config)).toBe(true);
          })
        );
      });

      it('property: config true always enables bypass regardless of env string', () => {
        fc.assert(
          fc.property(
            fc.oneof(fc.constant(undefined), fc.string()),
            (envValue) => {
              // Skip when env is exactly 'true' to test config independently
              if (envValue === 'true') return;

              const config: CertificateBypassConfig = {
                configIgnoreCertErrors: true,
                envIgnoreCertErrors: envValue,
              };
              expect(shouldBypassCertificateErrors(config)).toBe(true);
            }
          )
        );
      });

      it('property: only env value exactly "true" enables bypass (not other truthy strings)', () => {
        fc.assert(
          fc.property(
            fc.string().filter((s) => s !== 'true'),
            (envValue) => {
              const config: CertificateBypassConfig = {
                configIgnoreCertErrors: false,
                envIgnoreCertErrors: envValue,
              };
              expect(shouldBypassCertificateErrors(config)).toBe(false);
            }
          )
        );
      });
    });
  });

  describe('configureCertificateBypass', () => {
    describe('Example-Based Tests', () => {
      it('does not call setCertificateVerifyProc when bypass disabled', () => {
        const config: CertificateBypassConfig = {
          configIgnoreCertErrors: false,
          envIgnoreCertErrors: 'false',
        };

        const result = configureCertificateBypass(config);

        expect(result).toBe(false);
        expect(mockSetCertificateVerifyProc).not.toHaveBeenCalled();
        expect(mockLog).not.toHaveBeenCalled();
      });

      it('calls setCertificateVerifyProc when config.ignoreCertErrors is true', () => {
        const config: CertificateBypassConfig = {
          configIgnoreCertErrors: true,
        };

        const result = configureCertificateBypass(config);

        expect(result).toBe(true);
        expect(mockSetCertificateVerifyProc).toHaveBeenCalledTimes(1);
        expect(mockLog).toHaveBeenCalledWith(
          'warn',
          'Certificate error bypass is enabled - TLS certificate validation is disabled'
        );
      });

      it('calls setCertificateVerifyProc when env NOSTLING_IGNORE_CERT_ERRORS is "true"', () => {
        const config: CertificateBypassConfig = {
          envIgnoreCertErrors: 'true',
        };

        const result = configureCertificateBypass(config);

        expect(result).toBe(true);
        expect(mockSetCertificateVerifyProc).toHaveBeenCalledTimes(1);
      });

      it('certificate verify proc callback accepts all certificates', () => {
        const config: CertificateBypassConfig = {
          configIgnoreCertErrors: true,
        };

        configureCertificateBypass(config);

        // Get the callback passed to setCertificateVerifyProc
        const callback = mockSetCertificateVerifyProc.mock.calls[0][0] as (
          request: unknown,
          cb: (result: number) => void
        ) => void;

        // Simulate certificate verification callback
        const mockCertCallback = jest.fn();
        callback({}, mockCertCallback);

        // Should accept certificate (0 = OK)
        expect(mockCertCallback).toHaveBeenCalledWith(0);
      });
    });

    describe('Property-Based Tests', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      it('property: return value matches shouldBypassCertificateErrors', () => {
        fc.assert(
          fc.property(
            fc.record({
              configIgnoreCertErrors: fc.option(fc.boolean(), { nil: undefined }),
              envIgnoreCertErrors: fc.option(
                fc.oneof(fc.constant('true'), fc.constant('false'), fc.string()),
                { nil: undefined }
              ),
            }),
            (config) => {
              jest.clearAllMocks();

              const shouldBypass = shouldBypassCertificateErrors(config);
              const result = configureCertificateBypass(config);

              expect(result).toBe(shouldBypass);
            }
          )
        );
      });

      it('property: setCertificateVerifyProc called iff bypass enabled', () => {
        fc.assert(
          fc.property(
            fc.record({
              configIgnoreCertErrors: fc.option(fc.boolean(), { nil: undefined }),
              envIgnoreCertErrors: fc.option(
                fc.oneof(fc.constant('true'), fc.constant('false')),
                { nil: undefined }
              ),
            }),
            (config) => {
              jest.clearAllMocks();

              const shouldBypass = shouldBypassCertificateErrors(config);
              configureCertificateBypass(config);

              if (shouldBypass) {
                expect(mockSetCertificateVerifyProc).toHaveBeenCalledTimes(1);
              } else {
                expect(mockSetCertificateVerifyProc).not.toHaveBeenCalled();
              }
            }
          )
        );
      });

      it('property: warning logged iff bypass enabled', () => {
        fc.assert(
          fc.property(
            fc.record({
              configIgnoreCertErrors: fc.option(fc.boolean(), { nil: undefined }),
              envIgnoreCertErrors: fc.option(
                fc.oneof(fc.constant('true'), fc.constant('false')),
                { nil: undefined }
              ),
            }),
            (config) => {
              jest.clearAllMocks();

              const shouldBypass = shouldBypassCertificateErrors(config);
              configureCertificateBypass(config);

              if (shouldBypass) {
                expect(mockLog).toHaveBeenCalledWith('warn', expect.stringContaining('bypass'));
              } else {
                expect(mockLog).not.toHaveBeenCalled();
              }
            }
          )
        );
      });
    });
  });
});
