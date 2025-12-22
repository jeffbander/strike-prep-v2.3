import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Internal mutation to log email sends to audit log
 * Called from the email action
 */
export const logEmailSend = internalMutation({
  args: {
    scenarioId: v.id("strike_scenarios"),
    sent: v.number(),
    failed: v.number(),
    providerCount: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return;

    await ctx.db.insert("audit_logs", {
      userId: user._id,
      action: "SEND_EMAIL",
      resourceType: "SCENARIO",
      resourceId: args.scenarioId,
      changes: {
        type: "shift_availability",
        providerCount: args.providerCount,
        sent: args.sent,
        failed: args.failed,
      },
      timestamp: Date.now(),
    });
  },
});
