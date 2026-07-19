import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { initializeConsole, resetConsole } from './consoleManager.js';

describe('consoleManager', () => {
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;
  const origInfo = console.info;
  const origDebug = console.debug;

  beforeEach(() => {
    resetConsole();
  });

  afterEach(() => {
    resetConsole();
  });

  describe('initializeConsole', () => {
    it('replaces console.log', () => {
      initializeConsole();
      expect(console.log).not.toBe(origLog);
    });

    it('replaces console.error', () => {
      initializeConsole();
      expect(console.error).not.toBe(origError);
    });

    it('replaces console.warn', () => {
      initializeConsole();
      expect(console.warn).not.toBe(origWarn);
    });

    it('replaces console.info', () => {
      initializeConsole();
      expect(console.info).not.toBe(origInfo);
    });

    it('replaces console.debug', () => {
      initializeConsole();
      expect(console.debug).not.toBe(origDebug);
    });
  });

  describe('resetConsole', () => {
    it('restores original console.log', () => {
      initializeConsole();
      expect(console.log).not.toBe(origLog);
      resetConsole();
      expect(console.log).toBe(origLog);
    });

    it('restores all original console methods', () => {
      initializeConsole();
      resetConsole();
      expect(console.error).toBe(origError);
      expect(console.warn).toBe(origWarn);
      expect(console.info).toBe(origInfo);
      expect(console.debug).toBe(origDebug);
    });
  });

  describe('round-trip', () => {
    it('init then reset restores original behavior', () => {
      initializeConsole();
      resetConsole();
      expect(console.log).toBe(origLog);
      expect(console.error).toBe(origError);
    });
  });
});
