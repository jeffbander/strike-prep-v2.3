import { NextResponse } from "next/server";
import { generateCsrfToken } from "@/lib/withCsrf";

/**
 * CSRF Token Endpoint
 *
 * GET /api/csrf - Returns a CSRF token for use in subsequent requests
 *
 * Usage (Frontend):
 *   const { token } = await fetch('/api/csrf').then(r => r.json());
 *   await fetch('/api/protected', {
 *     method: 'POST',
 *     headers: { 'X-CSRF-Token': token },
 *     body: JSON.stringify(data)
 *   });
 */
export async function GET() {
  const token = generateCsrfToken();

  return NextResponse.json(
    { token },
    {
      headers: {
        // Don't cache CSRF tokens
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    }
  );
}

export const runtime = "nodejs";
