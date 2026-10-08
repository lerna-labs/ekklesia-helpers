import fs from 'fs/promises';
import { join } from 'path';

/** Minimal Express-like application interface for route registration. */
interface ExpressApp {
  use(path: string, router: unknown): void;
}

/** Minimal Express-like router interface. */
interface ExpressRouter {
  use: (...args: unknown[]) => void;
}

/**
 * Recursively loads route files from a directory and registers them with an Express app.
 *
 * Scans for `.js` files (excluding `index.js`), dynamically imports them, and mounts
 * their default export as an Express router at a path derived from the file's location.
 * A file that fails to import does not stop the walk; after every file has been tried,
 * the call rejects with an error naming each file that failed.
 *
 * @param directory - The base directory to search for route files.
 * @param app - The Express application instance.
 * @param baseRoute - The base route path (used internally for recursion).
 * @returns A promise that rejects if any route file failed to import.
 *
 * @example
 * ```ts
 * import express from "express";
 * const app = express();
 * await loadRoutes("./routes", app);
 * ```
 */
export async function loadRoutes(
  directory: string,
  app: ExpressApp,
  baseRoute = '',
): Promise<void> {
  const failures: string[] = [];
  await walk(directory, app, baseRoute, failures);

  if (failures.length > 0) {
    throw new Error(`Error loading routes: ${failures.join('; ')}`);
  }
}

async function walk(
  directory: string,
  app: ExpressApp,
  baseRoute: string,
  failures: string[],
): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      const nextBaseRoute = join(baseRoute, entry.name).replace(/\\/g, '/');
      await walk(fullPath, app, nextBaseRoute, failures);
    } else if (entry.name.endsWith('.js') && entry.name !== 'index.js') {
      const routeName = entry.name.replace('.js', '');
      const routePath = `/${baseRoute}/${routeName}`.replace(/\/+/g, '/');

      try {
        const routeModule = (await import(`file://${fullPath}`)) as { default?: ExpressRouter };
        const router = routeModule.default;

        if (router && typeof router.use === 'function') {
          console.log(`Route loaded: ${routePath}`);
          app.use(routePath, router);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${fullPath}: ${message}`);
      }
    }
  }
}
