"use client";

import { ConvexReactClient } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md p-8 bg-white rounded-lg shadow-lg">
          <h1 className="text-xl font-bold text-gray-900 mb-4">
            Development Setup Required
          </h1>
          <p className="text-gray-600 mb-4">
            Convex is not configured. To get started:
          </p>
          <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 mb-4">
            <li>Run <code className="bg-gray-100 px-1 rounded">npx convex dev</code> in your terminal</li>
            <li>This will create a <code className="bg-gray-100 px-1 rounded">.env.local</code> file with your Convex URL</li>
            <li>Restart the Next.js dev server</li>
          </ol>
          <p className="text-xs text-gray-500">
            See CLAUDE.md for full environment setup instructions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
