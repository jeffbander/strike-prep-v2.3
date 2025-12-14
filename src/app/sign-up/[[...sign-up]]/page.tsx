import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left side - Branding */}
      <div
        className="lg:w-1/2 flex flex-col items-center justify-center p-8 lg:p-16"
        style={{ backgroundColor: "#212070" }}
      >
        {/* Mount Sinai Logo/Wordmark */}
        <div className="text-center mb-8">
          <svg
            viewBox="0 0 300 80"
            className="w-64 lg:w-80 mx-auto mb-4"
            aria-label="Mount Sinai Health System"
          >
            {/* Mountain icon */}
            <path
              d="M30 60 L50 20 L70 60 Z"
              fill="#06ABEB"
            />
            <path
              d="M45 60 L60 30 L75 60 Z"
              fill="#ffffff"
              fillOpacity="0.3"
            />
            {/* Text */}
            <text x="90" y="35" fill="white" fontSize="24" fontWeight="bold" fontFamily="system-ui, sans-serif">
              MOUNT SINAI
            </text>
            <text x="90" y="58" fill="#06ABEB" fontSize="14" fontWeight="500" fontFamily="system-ui, sans-serif">
              HEALTH SYSTEM
            </text>
          </svg>
        </div>

        {/* Tagline */}
        <div className="text-center max-w-md">
          <h1 className="text-white text-2xl lg:text-3xl font-bold mb-4">
            Strike Preparation Portal
          </h1>
          <p className="text-blue-200 text-lg mb-6">
            Workforce planning and provider coordination for New York City&apos;s premier healthcare network
          </p>
          <div className="flex items-center justify-center gap-2 text-blue-300 text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>New York, NY</span>
          </div>
        </div>

        {/* Footer stats */}
        <div className="mt-12 grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-2xl lg:text-3xl font-bold" style={{ color: "#06ABEB" }}>8</div>
            <div className="text-blue-200 text-xs lg:text-sm">Hospitals</div>
          </div>
          <div>
            <div className="text-2xl lg:text-3xl font-bold" style={{ color: "#06ABEB" }}>42K+</div>
            <div className="text-blue-200 text-xs lg:text-sm">Employees</div>
          </div>
          <div>
            <div className="text-2xl lg:text-3xl font-bold" style={{ color: "#06ABEB" }}>#1</div>
            <div className="text-blue-200 text-xs lg:text-sm">In NYC</div>
          </div>
        </div>
      </div>

      {/* Right side - Sign Up */}
      <div
        className="lg:w-1/2 flex items-center justify-center p-8 lg:p-16"
        style={{ backgroundColor: "#00002D" }}
      >
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-white text-xl font-semibold mb-2">Create Account</h2>
            <p className="text-slate-400">Complete your registration to get started</p>
          </div>
          <SignUp
            afterSignUpUrl="/dashboard"
            signInUrl="/sign-in"
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "bg-slate-800/50 border border-slate-700 shadow-2xl",
                headerTitle: "text-white",
                headerSubtitle: "text-slate-400",
                socialButtonsBlockButton: "bg-slate-700 border-slate-600 text-white hover:bg-slate-600",
                socialButtonsBlockButtonText: "text-white",
                dividerLine: "bg-slate-600",
                dividerText: "text-slate-400",
                formFieldLabel: "text-slate-300",
                formFieldInput: "bg-slate-700 border-slate-600 text-white placeholder:text-slate-500",
                formButtonPrimary: "bg-[#06ABEB] hover:bg-[#0599d4] text-white",
                footerActionLink: "text-[#06ABEB] hover:text-[#0599d4]",
                identityPreviewText: "text-white",
                identityPreviewEditButton: "text-[#06ABEB]",
                formFieldInputShowPasswordButton: "text-slate-400 hover:text-white",
                alertText: "text-slate-300",
                formFieldSuccessText: "text-green-400",
                formFieldErrorText: "text-red-400",
              },
              layout: {
                socialButtonsPlacement: "bottom",
                socialButtonsVariant: "iconButton",
              },
            }}
          />
          <p className="mt-4 text-sm text-slate-400 text-center">
            Note: You must be invited by an administrator to use this application.
          </p>
        </div>
      </div>
    </div>
  );
}
