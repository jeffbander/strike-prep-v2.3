import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * CSRF Protection Middleware
 *
 * Protects against Cross-Site Request Forgery attacks using HMAC-SHA256 tokens.
 *
 * Usage:
 *   // Protect a POST/PUT/DELETE endpoint
 *   export const POST = withCsrf(handler);
 *
 *   // Combine with rate limiting (rate limit first!)
 *   export const POST = withRateLimit(withCsrf(handler));
 *
 * Frontend:
 *   1. GET /api/csrf to get a token
 *   2. Include token in X-CSRF-Token header with requests
 */

const CSRF_SECRET = process.env.CSRF_SECRET;
const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

interface TokenPayload {
  timestamp: number;
  random: string;
}

/**
 * Generate a CSRF token
 */
export function generateCsrfToken(): string {
  if (!CSRF_SECRET) {
    console.warn("CSRF_SECRET not set - using fallback (NOT SECURE FOR PRODUCTION)");
  }

  const secret = CSRF_SECRET || "dev-fallback-secret-not-for-production";
  const payload: TokenPayload = {
    timestamp: Date.now(),
    random: crypto.randomBytes(16).toString("hex"),
  };

  const payloadStr = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadStr).toString("base64url");

  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadBase64)
    .digest("base64url");

  return `${payloadBase64}.${signature}`;
}

/**
 * Verify a CSRF token
 */
export function verifyCsrfToken(token: string): boolean {
  if (!token) return false;

  const secret = CSRF_SECRET || "dev-fallback-secret-not-for-production";

  try {
    const [payloadBase64, signature] = token.split(".");
    if (!payloadBase64 || !signature) return false;

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payloadBase64)
      .digest("base64url");

    if (signature !== expectedSignature) return false;

    // Verify expiry
    const payloadStr = Buffer.from(payloadBase64, "base64url").toString();
    const payload: TokenPayload = JSON.parse(payloadStr);

    if (Date.now() - payload.timestamp > TOKEN_EXPIRY_MS) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * CSRF Protection Middleware
 */
export function withCsrf<T>(
  handler: (request: NextRequest) => Promise<NextResponse<T>>
) {
  return async (request: NextRequest): Promise<NextResponse<T> | NextResponse> => {
    // Skip CSRF for GET, HEAD, OPTIONS (read-only operations)
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      return handler(request);
    }

    // Get token from header
    const token = request.headers.get("X-CSRF-Token");

    if (!token) {
      return NextResponse.json(
        {
          error: "CSRF token missing",
          message: "Please include X-CSRF-Token header",
        },
        { status: 403 }
      );
    }

    if (!verifyCsrfToken(token)) {
      return NextResponse.json(
        {
          error: "CSRF token invalid",
          message: "Token is invalid or expired. Please refresh and try again.",
        },
        { status: 403 }
      );
    }

    return handler(request);
  };
}
