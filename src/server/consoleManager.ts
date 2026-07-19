/**
 * Console manager that overrides default console methods to add colored log-level prefixes.
 *
 * @module server/consoleManager
 */

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
} as const;

/**
 * Initialize console with colored log-level prefixes.
 *
 * @example
 * ```ts
 * initializeConsole();
 * console.log("hello");   // prints "INFO: hello" in green
 * console.error("oops");  // prints "ERROR: oops" in red
 * ```
 */
export function initializeConsole(): void {
  console.log = (...args: unknown[]) => {
    originalConsoleLog(colors.green + 'INFO:' + colors.reset, ...args);
  };

  console.error = (...args: unknown[]) => {
    originalConsoleError(colors.red + colors.bright + 'ERROR:' + colors.reset, ...args);
  };

  console.warn = (...args: unknown[]) => {
    originalConsoleWarn(colors.yellow + 'WARN:' + colors.reset, ...args);
  };

  console.info = (...args: unknown[]) => {
    originalConsoleInfo(colors.cyan + 'INFO:' + colors.reset, ...args);
  };

  console.debug = (...args: unknown[]) => {
    originalConsoleDebug(colors.magenta + 'DEBUG:' + colors.reset, ...args);
  };
}

/**
 * Reset console to original behavior, removing colored prefixes.
 */
export function resetConsole(): void {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.info = originalConsoleInfo;
  console.debug = originalConsoleDebug;
}
