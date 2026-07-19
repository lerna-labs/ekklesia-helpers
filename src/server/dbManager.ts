import mongoose from 'mongoose';

/**
 * Database connection manager for MongoDB using Mongoose.
 * Provides connection lifecycle management with automatic reconnection.
 *
 * @module server/dbManager
 */

let connection: mongoose.Connection | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL = 5000;

let isIntentionalDisconnect = false;

function buildConnectionString(): string {
  const host = process.env.MONGODB_HOST || 'localhost';
  const port = process.env.MONGODB_PORT || '27017';
  const database = process.env.MONGODB_DATABASE;
  const username = process.env.MONGODB_USERNAME;
  const password = process.env.MONGODB_PASSWORD;
  const authSource = process.env.MONGODB_AUTH_SOURCE || 'admin';

  if (!database) {
    throw new Error('MONGODB_DATABASE environment variable is not defined');
  }

  let mongoUri = 'mongodb://';

  if (username && password) {
    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);
    mongoUri += `${encodedUsername}:${encodedPassword}@`;
  }

  mongoUri += `${host}:${port}/${database}`;

  if (username && password) {
    mongoUri += `?authSource=${authSource}`;
  }

  return mongoUri;
}

/**
 * Connect to MongoDB using environment variables.
 *
 * @param isReconnectAttempt - Whether this is a reconnection attempt.
 * @returns The Mongoose connection object, or `null` if connection failed.
 */
export async function connectToDatabase(
  isReconnectAttempt = false,
): Promise<mongoose.Connection | null> {
  try {
    if (connection && connection.readyState === 1) {
      console.info('Using existing database connection');
      return connection;
    }

    const mongoUri = buildConnectionString();
    mongoose.set('strictQuery', true);

    if (isReconnectAttempt) {
      console.info(`Reconnection attempt ${reconnectAttempts} to MongoDB...`);
    } else {
      console.info('Connecting to MongoDB...');
      reconnectAttempts = 0;
    }

    await mongoose.connect(mongoUri);
    connection = mongoose.connection;

    connection.on('error', (err: Error) => {
      console.error(`MongoDB connection error: ${err}`);
    });

    connection.on('disconnected', () => {
      if (!isIntentionalDisconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        console.warn('MongoDB disconnected');
        reconnectAttempts++;
        console.info(`Scheduling reconnection attempt in ${RECONNECT_INTERVAL / 1000} seconds...`);
        setTimeout(() => {
          connectToDatabase(true).catch((err: Error) => {
            console.error(`Reconnection attempt failed: ${err.message}`);
          });
        }, RECONNECT_INTERVAL);
      } else if (!isIntentionalDisconnect) {
        console.error(
          `Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`,
        );
        connection = null;
      }
    });

    process.on('SIGINT', async () => {
      if (connection) {
        console.info('Closing MongoDB connection due to application termination');
        await connection.close();
        process.exit(0);
      }
    });

    const dbInfo = `${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DATABASE}`;
    console.info(`Successfully connected to MongoDB at ${dbInfo}`);
    reconnectAttempts = 0;

    return connection;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Database connection error: ${message}`);

    if (!isReconnectAttempt && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.info(`Scheduling reconnection attempt in ${RECONNECT_INTERVAL / 1000} seconds...`);
      setTimeout(() => {
        connectToDatabase(true).catch((err: Error) => {
          console.error(`Reconnection attempt failed: ${err.message}`);
        });
      }, RECONNECT_INTERVAL);
    }

    return null;
  }
}

/**
 * Disconnect from MongoDB.
 */
export async function disconnectFromDatabase(): Promise<void> {
  if (connection) {
    isIntentionalDisconnect = true;
    await mongoose.disconnect();
    connection = null;
    console.info('Disconnected from MongoDB');
    setTimeout(() => {
      isIntentionalDisconnect = false;
    }, 1000);
  }
}

/**
 * Check if the database connection is healthy by sending a ping.
 *
 * @returns `true` if the connection is alive.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    if (connection && connection.readyState === 1) {
      await mongoose.connection.db!.admin().ping();
      return true;
    }
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Database health check failed: ${message}`);
    return false;
  }
}

/**
 * Get the current database connection status synchronously.
 *
 * @returns `true` if the database is connected.
 */
export function isDatabaseConnected(): boolean {
  return connection !== null && connection.readyState === 1;
}

/** Minimal Express-compatible request/response/next for the middleware. */
interface MiddlewareRequest {
  [key: string]: unknown;
}
interface MiddlewareResponse {
  status(code: number): MiddlewareResponse;
  json(body: unknown): void;
}
type NextFunction = () => void;

/**
 * Express middleware that returns 503 if the database is not connected.
 */
export const checkDatabaseConnectionMW = async (
  _req: MiddlewareRequest,
  res: MiddlewareResponse,
  next: NextFunction,
): Promise<void> => {
  const isConnected = await checkDatabaseConnection();
  if (!isConnected) {
    res.status(503).json({
      status: 'error',
      message: 'Database connection is unavailable',
    });
    return;
  }
  next();
};
