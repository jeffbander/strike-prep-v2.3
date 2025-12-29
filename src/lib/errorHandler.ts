import { NextResponse } from "next/server";

/**
 * Secure Error Handler
 *
 * Returns generic error messages in production to prevent information leakage.
 * Returns detailed errors in development for debugging.
 *
 * Usage:
 *   try {
 *     // ... your code
 *   } catch (error) {
 *     return handleApiError(error, 'create-provider');
 *   }
 */

const isProduction = process.env.NODE_ENV === "production";

interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: unknown;
}

/**
 * Handle API errors securely
 */
export function handleApiError(
  error: unknown,
  context?: string
): NextResponse<ErrorResponse> {
  // Log the full error server-side
  console.error(`[${context || "API"}] Error:`, error);

  // In development, return detailed error
  if (!isProduction) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json(
      {
        error: "Internal Server Error",
        message,
        code: context,
        details: stack,
      },
      { status: 500 }
    );
  }

  // In production, return generic error (no information leakage)
  return NextResponse.json(
    {
      error: "Internal Server Error",
      message: "An unexpected error occurred. Please try again later.",
      code: context,
    },
    { status: 500 }
  );
}

/**
 * Handle unauthorized access
 */
export function handleUnauthorizedError(
  message?: string
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error: "Unauthorized",
      message: message || "Authentication required",
    },
    { status: 401 }
  );
}

/**
 * Handle forbidden access
 */
export function handleForbiddenError(
  message?: string
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error: "Forbidden",
      message: message || "You do not have permission to perform this action",
    },
    { status: 403 }
  );
}

/**
 * Handle not found
 */
export function handleNotFoundError(
  resource?: string
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error: "Not Found",
      message: resource ? `${resource} not found` : "Resource not found",
    },
    { status: 404 }
  );
}

/**
 * Handle validation errors
 */
export function handleValidationError(
  details: Record<string, string>
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error: "Validation Failed",
      message: "Please check your input and try again",
      details,
    },
    { status: 400 }
  );
}
