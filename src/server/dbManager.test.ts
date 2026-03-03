import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("mongoose", () => {
  const mockConnection = {
    readyState: 1,
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    db: {
      admin: () => ({
        ping: vi.fn().mockResolvedValue({ ok: 1 }),
      }),
    },
  };

  return {
    default: {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      connection: mockConnection,
    },
  };
});

describe("dbManager", () => {
  const ORIGINAL_ENV = process.env;
  let processOnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      MONGODB_HOST: "localhost",
      MONGODB_PORT: "27017",
      MONGODB_DATABASE: "testdb",
    };
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);
    vi.useFakeTimers();
  });

  afterEach(async () => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.resetModules();
  });

  describe("connectToDatabase", () => {
    it("throws when MONGODB_DATABASE is missing", async () => {
      delete process.env.MONGODB_DATABASE;
      const { connectToDatabase } = await import("./dbManager.js");
      const result = await connectToDatabase();
      expect(result).toBeNull();
    });

    it("connects successfully", async () => {
      const { connectToDatabase } = await import("./dbManager.js");
      const result = await connectToDatabase();
      expect(result).not.toBeNull();
    });

    it("builds URI with credentials", async () => {
      process.env.MONGODB_USERNAME = "user";
      process.env.MONGODB_PASSWORD = "pass";
      const mongoose = (await import("mongoose")).default;
      const { connectToDatabase } = await import("./dbManager.js");
      await connectToDatabase();
      expect(mongoose.connect).toHaveBeenCalledWith(expect.stringContaining("user:pass@"));
    });

    it("builds URI without credentials", async () => {
      const mongoose = (await import("mongoose")).default;
      const { connectToDatabase } = await import("./dbManager.js");
      await connectToDatabase();
      expect(mongoose.connect).toHaveBeenCalledWith(
        expect.stringContaining("mongodb://localhost:27017/testdb"),
      );
    });

    it("returns null on connection failure", async () => {
      const mongoose = (await import("mongoose")).default;
      vi.mocked(mongoose.connect).mockRejectedValueOnce(new Error("Connection refused"));
      const { connectToDatabase } = await import("./dbManager.js");
      const result = await connectToDatabase();
      expect(result).toBeNull();
    });

    it("registers SIGINT handler", async () => {
      const { connectToDatabase } = await import("./dbManager.js");
      await connectToDatabase();
      expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    });
  });

  describe("disconnectFromDatabase", () => {
    it("disconnects when connected", async () => {
      const mongoose = (await import("mongoose")).default;
      const { connectToDatabase, disconnectFromDatabase } = await import("./dbManager.js");
      await connectToDatabase();
      await disconnectFromDatabase();
      expect(mongoose.disconnect).toHaveBeenCalled();
    });
  });

  describe("isDatabaseConnected", () => {
    it("returns true when connected", async () => {
      const { connectToDatabase, isDatabaseConnected } = await import("./dbManager.js");
      await connectToDatabase();
      expect(isDatabaseConnected()).toBe(true);
    });

    it("returns false when not connected", async () => {
      const { isDatabaseConnected } = await import("./dbManager.js");
      expect(isDatabaseConnected()).toBe(false);
    });
  });

  describe("checkDatabaseConnection", () => {
    it("returns true when connected and ping succeeds", async () => {
      const { connectToDatabase, checkDatabaseConnection } = await import("./dbManager.js");
      await connectToDatabase();
      const result = await checkDatabaseConnection();
      expect(result).toBe(true);
    });

    it("returns false when not connected", async () => {
      const { checkDatabaseConnection } = await import("./dbManager.js");
      const result = await checkDatabaseConnection();
      expect(result).toBe(false);
    });
  });

  describe("checkDatabaseConnectionMW", () => {
    it("calls next when DB is up", async () => {
      const { connectToDatabase, checkDatabaseConnectionMW } = await import("./dbManager.js");
      await connectToDatabase();
      const next = vi.fn();
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await checkDatabaseConnectionMW({}, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("returns 503 when DB is down", async () => {
      const { checkDatabaseConnectionMW } = await import("./dbManager.js");
      const next = vi.fn();
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await checkDatabaseConnectionMW({}, res, next);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
