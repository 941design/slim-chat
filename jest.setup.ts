/**
 * Jest Global Setup
 *
 * Suppress expected console warnings during tests.
 */

// Mock Electron's app module for tests that trigger logging
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/nostling-test'),
  },
}), { virtual: true });

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args: unknown[]) => {
  const message = args[0];
  // Suppress application log entries during tests (they use console.log for log output)
  if (typeof message === 'string' && message.match(/^\[\d{4}-\d{2}-\d{2}T/)) {
    return;
  }
  originalLog.apply(console, args);
};

console.warn = (...args: unknown[]) => {
  const message = args[0];
  if (typeof message === 'string' && message.startsWith('[url-sanitizer]')) {
    return; // Suppress url-sanitizer warnings during tests
  }
  originalWarn.apply(console, args);
};

console.error = (...args: unknown[]) => {
  const message = args[0];
  if (typeof message === 'string' && message.startsWith('Failed to write log')) {
    return; // Suppress logger errors in tests (Electron app not available)
  }
  originalError.apply(console, args);
};
