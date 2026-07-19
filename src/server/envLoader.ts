import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Loads environment variables from `.env.{NODE_ENV}` with fallback to `.env`.
 *
 * @param rootDir - Optional root directory to load env files from.
 *   If not provided, attempts to detect the calling file's directory.
 *
 * @example
 * ```ts
 * loadEnvironmentVariables();
 * // or with explicit path:
 * loadEnvironmentVariables("/app");
 * ```
 */
export function loadEnvironmentVariables(rootDir?: string): void {
  console.log('Loading environment variables...', rootDir);

  if (!rootDir) {
    const callerURL = new Error().stack?.split('\n')[2]?.match(/at\s+.+\s+\((.+):\d+:\d+\)/)?.[1];

    if (callerURL) {
      const callerPath = fileURLToPath(callerURL);
      rootDir = path.dirname(callerPath);
    } else {
      rootDir = process.cwd();
    }
  }

  const environment = process.env.NODE_ENV || 'development';
  const envPath = path.resolve(rootDir, `.env.${environment}`);
  const defaultEnvPath = path.resolve(rootDir, '.env');

  try {
    const envConfig = dotenv.config({ path: envPath, quiet: true });

    if (envConfig.error) {
      console.log(`No .env.${environment} found, trying default .env`);
      const defaultConfig = dotenv.config({ path: defaultEnvPath, quiet: true });

      if (defaultConfig.error) {
        console.warn('No .env file found');
      } else {
        console.log(`Loaded environment variables from .env`);
      }
    } else {
      console.log(`Loaded environment variables from .env.${environment}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Error loading environment variables: ${message}`);
    throw error;
  }
}
