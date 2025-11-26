import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <SignUp
          afterSignUpUrl="/dashboard"
          signInUrl="/sign-in"
        />
        <p className="mt-4 text-sm text-slate-400">
          Note: You must be invited by an administrator to use this application.
        </p>
      </div>
    </div>
  );
}
