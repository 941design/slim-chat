/**
 * Security Tests for URL Sanitization
 *
 * Verifies protection against XSS attacks via malicious picture URLs.
 */

import { sanitizePictureUrl } from './url-sanitizer';

describe('sanitizePictureUrl - Security Tests', () => {
  describe('XSS Protection', () => {
    it('rejects javascript: URLs', () => {
      const maliciousUrl = 'javascript:alert("XSS")';
      expect(sanitizePictureUrl(maliciousUrl)).toBeNull();
    });

    it('rejects data: URLs', () => {
      const dataUrl = 'data:text/html,<script>alert("XSS")</script>';
      expect(sanitizePictureUrl(dataUrl)).toBeNull();
    });

    it('rejects vbscript: URLs', () => {
      const vbscriptUrl = 'vbscript:msgbox("XSS")';
      expect(sanitizePictureUrl(vbscriptUrl)).toBeNull();
    });

    it('rejects file: URLs', () => {
      const fileUrl = 'file:///etc/passwd';
      expect(sanitizePictureUrl(fileUrl)).toBeNull();
    });

    it('rejects blob: URLs', () => {
      const blobUrl = 'blob:https://example.com/uuid';
      expect(sanitizePictureUrl(blobUrl)).toBeNull();
    });
  });

  describe('Valid URLs', () => {
    it('accepts http: URLs', () => {
      const httpUrl = 'http://example.com/avatar.jpg';
      expect(sanitizePictureUrl(httpUrl)).toBe(httpUrl);
    });

    it('accepts https: URLs', () => {
      const httpsUrl = 'https://example.com/avatar.jpg';
      expect(sanitizePictureUrl(httpsUrl)).toBe(httpsUrl);
    });

    it('accepts https URLs with query parameters', () => {
      const httpsUrl = 'https://example.com/avatar.jpg?size=large&format=webp';
      expect(sanitizePictureUrl(httpsUrl)).toBe(httpsUrl);
    });

    it('accepts https URLs with fragments', () => {
      const httpsUrl = 'https://example.com/avatar.jpg#main';
      expect(sanitizePictureUrl(httpsUrl)).toBe(httpsUrl);
    });
  });

  describe('Null/Empty Handling', () => {
    it('returns null for null input', () => {
      expect(sanitizePictureUrl(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(sanitizePictureUrl(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(sanitizePictureUrl('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(sanitizePictureUrl('   ')).toBeNull();
    });
  });

  describe('Malformed URLs', () => {
    it('rejects malformed URLs', () => {
      const malformed = 'not-a-valid-url';
      expect(sanitizePictureUrl(malformed)).toBeNull();
    });

    it('rejects URLs with no scheme', () => {
      const noScheme = '//example.com/avatar.jpg';
      expect(sanitizePictureUrl(noScheme)).toBeNull();
    });
  });

  describe('Properties', () => {
    it('is idempotent for valid URLs', () => {
      const validUrl = 'https://example.com/avatar.jpg';
      const sanitized = sanitizePictureUrl(validUrl);
      expect(sanitizePictureUrl(sanitized)).toBe(sanitized);
    });

    it('is idempotent for null', () => {
      expect(sanitizePictureUrl(sanitizePictureUrl(null))).toBeNull();
    });

    it('always returns null or valid http(s) URL', () => {
      const testUrls = [
        'https://example.com/avatar.jpg',
        'http://example.com/avatar.jpg',
        'javascript:alert(1)',
        'data:text/html,test',
        null,
        undefined,
        '',
      ];

      testUrls.forEach((url) => {
        const result = sanitizePictureUrl(url);
        if (result !== null) {
          expect(result).toMatch(/^https?:\/\//);
        }
      });
    });
  });
});
