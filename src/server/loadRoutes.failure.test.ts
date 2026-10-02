import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadRoutes } from './loadRoutes.js';

const goodRoute = 'export default { use() {} };\n';

describe('loadRoutes with a failing route file', () => {
  let dir: string;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    dir = await mkdtemp(join(tmpdir(), 'load-routes-'));
    await mkdir(join(dir, 'nested'));
    await writeFile(join(dir, 'a.js'), goodRoute);
    await writeFile(join(dir, 'broken.js'), "throw new Error('missing env');\n");
    await writeFile(join(dir, 'nested', 'b.js'), goodRoute);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('registers the good routes and rejects naming the failed file', async () => {
    const app = { use: vi.fn() };

    await expect(loadRoutes(dir, app)).rejects.toThrow(/broken\.js: missing env/);

    const paths = app.use.mock.calls.map((call) => call[0]);
    expect(paths).toContain('/a');
    expect(paths).toContain('/nested/b');
  });
});
