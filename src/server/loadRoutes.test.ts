import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("fs/promises", () => ({
  default: {
    readdir: vi.fn(),
  },
}));

describe("loadRoutes", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function makeDirent(name: string, isDir: boolean) {
    return {
      name,
      isDirectory: () => isDir,
      isFile: () => !isDir,
    };
  }

  it("does nothing for empty directory", async () => {
    const fs = (await import("fs/promises")).default;
    vi.mocked(fs.readdir).mockResolvedValueOnce([] as never);
    const { loadRoutes } = await import("./loadRoutes.js");
    const app = { use: vi.fn() };
    await loadRoutes("/routes", app);
    expect(app.use).not.toHaveBeenCalled();
  });

  it("skips index.js files", async () => {
    const fs = (await import("fs/promises")).default;
    vi.mocked(fs.readdir).mockResolvedValueOnce([makeDirent("index.js", false)] as never);
    const { loadRoutes } = await import("./loadRoutes.js");
    const app = { use: vi.fn() };
    await loadRoutes("/routes", app);
    expect(app.use).not.toHaveBeenCalled();
  });

  it("skips non-.js files", async () => {
    const fs = (await import("fs/promises")).default;
    vi.mocked(fs.readdir).mockResolvedValueOnce([makeDirent("readme.md", false)] as never);
    const { loadRoutes } = await import("./loadRoutes.js");
    const app = { use: vi.fn() };
    await loadRoutes("/routes", app);
    expect(app.use).not.toHaveBeenCalled();
  });

  it("recurses into subdirectories", async () => {
    const fs = (await import("fs/promises")).default;
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce([makeDirent("api", true)] as never)
      .mockResolvedValueOnce([] as never);
    const { loadRoutes } = await import("./loadRoutes.js");
    const app = { use: vi.fn() };
    await loadRoutes("/routes", app);
    expect(fs.readdir).toHaveBeenCalledTimes(2);
  });

  it("handles readdir error gracefully", async () => {
    const fs = (await import("fs/promises")).default;
    vi.mocked(fs.readdir).mockRejectedValueOnce(new Error("ENOENT"));
    const { loadRoutes } = await import("./loadRoutes.js");
    const app = { use: vi.fn() };
    await loadRoutes("/nonexistent", app);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Error loading routes"));
  });
});
