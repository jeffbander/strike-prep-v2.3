import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run census cleanup every day at 2 AM EST (7 AM UTC)
crons.daily(
  "census data cleanup",
  { hourUTC: 7, minuteUTC: 0 },
  internal.censusCleanup.cleanupExpiredData
);

export default crons;
