import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

describe('envLoader', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('loads .env.{NODE_ENV} when it exists', async () => {
    const dotenv = (await import('dotenv')).default;
    vi.mocked(dotenv.config).mockReturnValueOnce({ parsed: { KEY: 'value' } });
    const { loadEnvironmentVariables } = await import('./envLoader.js');
    loadEnvironmentVariables('/app');
    expect(dotenv.config).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('.env.test') }),
    );
  });

  it('falls back to .env when .env.{NODE_ENV} not found', async () => {
    const dotenv = (await import('dotenv')).default;
    vi.mocked(dotenv.config)
      .mockReturnValueOnce({ error: new Error('ENOENT') as never })
      .mockReturnValueOnce({ parsed: { KEY: 'value' } });
    const { loadEnvironmentVariables } = await import('./envLoader.js');
    loadEnvironmentVariables('/app');
    expect(dotenv.config).toHaveBeenCalledTimes(2);
  });

  it('warns when neither env file found', async () => {
    const dotenv = (await import('dotenv')).default;
    vi.mocked(dotenv.config)
      .mockReturnValueOnce({ error: new Error('ENOENT') as never })
      .mockReturnValueOnce({ error: new Error('ENOENT') as never });
    const { loadEnvironmentVariables } = await import('./envLoader.js');
    loadEnvironmentVariables('/app');
    expect(console.warn).toHaveBeenCalledWith('No .env file found');
  });

  it('uses provided rootDir', async () => {
    const dotenv = (await import('dotenv')).default;
    vi.mocked(dotenv.config).mockReturnValueOnce({ parsed: {} });
    const { loadEnvironmentVariables } = await import('./envLoader.js');
    loadEnvironmentVariables('/custom/path');
    expect(dotenv.config).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('/custom/path/') }),
    );
  });

  it('throws on dotenv error', async () => {
    const dotenv = (await import('dotenv')).default;
    vi.mocked(dotenv.config).mockImplementationOnce(() => {
      throw new Error('Permission denied');
    });
    const { loadEnvironmentVariables } = await import('./envLoader.js');
    expect(() => loadEnvironmentVariables('/app')).toThrow('Permission denied');
  });
});
