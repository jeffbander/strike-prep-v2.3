import Link from "next/link";

export default function HomePage() {
  return (
    <div
      className="min-h-screen text-white flex flex-col items-center justify-center p-8"
      style={{ backgroundColor: "#212070" }}
    >
      {/* Mount Sinai Logo/Wordmark */}
      <div className="text-center mb-8">
        <svg
          viewBox="0 0 300 80"
          className="w-72 lg:w-96 mx-auto mb-6"
          aria-label="Mount Sinai Health System"
        >
          {/* Mountain icon */}
          <path d="M30 60 L50 20 L70 60 Z" fill="#06ABEB" />
          <path d="M45 60 L60 30 L75 60 Z" fill="#ffffff" fillOpacity="0.3" />
          {/* Text */}
          <text
            x="90"
            y="35"
            fill="white"
            fontSize="24"
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
          >
            MOUNT SINAI
          </text>
          <text
            x="90"
            y="58"
            fill="#06ABEB"
            fontSize="14"
            fontWeight="500"
            fontFamily="system-ui, sans-serif"
          >
            HEALTH SYSTEM
          </text>
        </svg>
      </div>

      <h1 className="text-4xl lg:text-5xl font-bold mb-4 text-center">
        Strike Preparation Portal
      </h1>
      <p className="text-xl text-blue-200 mb-8 text-center max-w-2xl">
        Workforce planning and provider coordination for New York City&apos;s
        premier healthcare network
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-8 mb-12 text-center">
        <div>
          <div className="text-3xl lg:text-4xl font-bold" style={{ color: "#06ABEB" }}>
            8
          </div>
          <div className="text-blue-200 text-sm">Hospitals</div>
        </div>
        <div>
          <div className="text-3xl lg:text-4xl font-bold" style={{ color: "#06ABEB" }}>
            42K+
          </div>
          <div className="text-blue-200 text-sm">Employees</div>
        </div>
        <div>
          <div className="text-3xl lg:text-4xl font-bold" style={{ color: "#06ABEB" }}>
            #1
          </div>
          <div className="text-blue-200 text-sm">In NYC</div>
        </div>
      </div>

      <div className="flex gap-4">
        <Link
          href="/sign-in"
          className="px-8 py-3 rounded-lg font-medium transition-colors text-white"
          style={{ backgroundColor: "#06ABEB" }}
        >
          Sign In
        </Link>
        <Link
          href="/sign-up"
          className="px-8 py-3 rounded-lg font-medium transition-colors border border-blue-300 text-blue-200 hover:bg-white/10"
        >
          Sign Up
        </Link>
      </div>

      <p className="mt-8 text-sm text-blue-300">
        Note: You must be invited by an administrator to use this application.
      </p>

      {/* Location badge */}
      <div className="mt-6 flex items-center gap-2 text-blue-300 text-sm">
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span>New York, NY</span>
      </div>
    </div>
  );
}
