import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-8">
      {/* App Icon */}
      <div className="mb-6">
        <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center">
          <svg
            className="w-10 h-10 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
        </div>
      </div>

      <h1 className="text-3xl lg:text-4xl font-bold mb-2 text-center">
        Strike Prep
      </h1>
      <p className="text-slate-400 mb-10 text-center">
        Internal staffing management portal
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/sign-in"
          className="w-full px-6 py-3 rounded-lg font-medium transition-colors text-white bg-blue-600 hover:bg-blue-700 text-center"
        >
          Sign In
        </Link>
        <Link
          href="/sign-up"
          className="w-full px-6 py-3 rounded-lg font-medium transition-colors border border-slate-600 text-slate-300 hover:bg-slate-800 text-center"
        >
          Sign Up
        </Link>
      </div>

      <p className="mt-8 text-sm text-slate-500 text-center max-w-xs">
        You must be invited by an administrator to access this application.
      </p>
    </div>
  );
}
