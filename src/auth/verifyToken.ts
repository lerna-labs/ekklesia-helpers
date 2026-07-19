import jwt from 'jsonwebtoken';

/** Successful token verification result. Includes all decoded JWT payload fields. */
export interface TokenVerificationSuccess {
  status: 'success';
  message: 'Token is valid';
  [key: string]: unknown;
}

/** Failed token verification result. */
export interface TokenVerificationError {
  status: 'error';
  message: string;
  code: number;
}

/** Result of verifying a JWT token. */
export type TokenVerificationResult = TokenVerificationSuccess | TokenVerificationError;

/** Minimal request interface for token extraction. */
interface TokenRequest {
  cookies?: Record<string, string>;
  headers?: Record<string, string | undefined>;
}

/**
 * Verifies a JWT token from request cookies or Authorization header.
 *
 * Extracts the token from `req.cookies.token` (preferred) or the `Authorization: Bearer <token>`
 * header. Verifies the JWT signature and expiration using the `JWT_SECRET` environment variable.
 *
 * On success, returns all decoded JWT payload fields spread into the result object.
 * Both platforms can access their expected fields (`userId`, `voterId`, `signType`,
 * `multiSig`, `exp`, etc.) directly from the result.
 *
 * @param req - Express-compatible request object with cookies and/or headers.
 * @returns A {@link TokenVerificationResult} — either success with decoded fields or an error.
 *
 * @example
 * ```ts
 * const result = verifyToken(req);
 * if (result.status === "error") {
 *   return res.status(result.code).json({ message: result.message });
 * }
 * // Access decoded fields directly:
 * const userId = result.userId as string;
 * ```
 */
export function verifyToken(req: TokenRequest): TokenVerificationResult {
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not defined in environment variables');
    return {
      status: 'error',
      message: 'Server configuration error',
      code: 500,
    };
  }

  // Get token from cookie (preferred) or Authorization header
  let token = req.cookies?.token;
  if (!token) {
    const auth = req.headers?.authorization;
    if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
      token = auth.slice(7).trim();
    }
  }

  if (!token) {
    return {
      status: 'error',
      message: 'No token provided',
      code: 401,
    };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded || typeof decoded === 'string') {
      return {
        status: 'error',
        message: 'Invalid token format',
        code: 401,
      };
    }

    // Check for at least one user identifier
    if (!decoded.userId && !decoded.voterId) {
      return {
        status: 'error',
        message: 'Invalid token format',
        code: 401,
      };
    }

    return {
      status: 'success',
      message: 'Token is valid',
      ...decoded,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TokenExpiredError') {
        return { status: 'error', message: 'Token has expired', code: 401 };
      }
      if (error.name === 'JsonWebTokenError') {
        return { status: 'error', message: 'Invalid token', code: 401 };
      }
      console.error('Token verification error:', error.message);
    }

    return {
      status: 'error',
      message: 'Token verification failed',
      code: 401,
    };
  }
}
