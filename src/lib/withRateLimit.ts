import { NextRequest, NextResponse } from "next/server";

/**
 * Rate Limiting Middleware
 *
 * Prevents abuse by limiting requests per IP address.
 * Default: 10 requests per minute per IP.
 *
 * Usage:
 *   export const POST = withRateLimit(handler);
 *   export const POST = withRateLimit(handler, { maxRequests: 5, windowMs: 60000 });
 */

interface RateLimitOptions {
  maxRequests?: number; // Max requests per window (default: 10)
  windowMs?: number; // Window size in milliseconds (default: 60000 = 1 minute)
}

// In-memory store for rate limiting (use Redis in production for multi-instance)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

function getClientIP(request: NextRequest): string {
  // Check various headers for the real IP
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // Fallback to a default (in development)
  return "127.0.0.1";
}

export function withRateLimit<T>(
  handler: (request: NextRequest) => Promise<NextResponse<T>>,
  options: RateLimitOptions = {}
) {
  const { maxRequests = 10, windowMs = 60000 } = options;

  return async (request: NextRequest): Promise<NextResponse<T> | NextResponse> => {
    const clientIP = getClientIP(request);
    const key = `${clientIP}:${request.nextUrl.pathname}`;
    const now = Date.now();

    // Get or create rate limit entry
    let entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      // New window
      entry = { count: 1, resetTime: now + windowMs };
      rateLimitStore.set(key, entry);
    } else {
      // Increment count in current window
      entry.count++;
    }

    // Check if rate limit exceeded
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

      return NextResponse.json(
        {
          error: "Too many requests",
          message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
          retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Limit": maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.ceil(entry.resetTime / 1000).toString(),
          },
        }
      );
    }

    // Add rate limit headers to successful responses
    const response = await handler(request);

    // Clone response to add headers
    const headers = new Headers(response.headers);
    headers.set("X-RateLimit-Limit", maxRequests.toString());
    headers.set("X-RateLimit-Remaining", (maxRequests - entry.count).toString());
    headers.set("X-RateLimit-Reset", Math.ceil(entry.resetTime / 1000).toString());

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
