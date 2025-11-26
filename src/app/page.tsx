import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold mb-4">Strike Prep V2</h1>
      <p className="text-xl text-slate-400 mb-8">Healthcare Staffing Management Platform</p>

      <div className="flex gap-4">
        <Link
          href="/sign-in"
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium transition-colors"
        >
          Sign In
        </Link>
        <Link
          href="/sign-up"
          className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
        >
          Sign Up
        </Link>
      </div>

      <p className="mt-8 text-sm text-slate-500">
        Note: You must be invited by an administrator to use this application.
      </p>
    </div>
  );
}
