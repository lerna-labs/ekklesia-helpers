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
 *
 * @param directory - The base directory to search for route files.
 * @param app - The Express application instance.
 * @param baseRoute - The base route path (used internally for recursion).
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
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        const nextBaseRoute = join(baseRoute, entry.name).replace(/\\/g, '/');
        await loadRoutes(fullPath, app, nextBaseRoute);
      } else if (entry.name.endsWith('.js') && entry.name !== 'index.js') {
        const routeName = entry.name.replace('.js', '');
        const routePath = `/${baseRoute}/${routeName}`.replace(/\/+/g, '/');

        const routeModule = (await import(`file://${fullPath}`)) as { default?: ExpressRouter };
        const router = routeModule.default;

        if (router && typeof router.use === 'function') {
          console.log(`Route loaded: ${routePath}`);
          app.use(routePath, router);
        }
      }
    }
  } catch (error) {
    console.log(error);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error loading routes: ${message}`);
  }
}
