import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get audit logs with filtering options
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
    resourceType: v.optional(v.string()),
    action: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) return [];

    // Only admins can view audit logs
    const allowedRoles = ["super_admin", "health_system_admin", "hospital_admin", "departmental_admin"];
    if (!allowedRoles.includes(currentUser.role)) {
      return [];
    }

    let logs = await ctx.db
      .query("audit_logs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(args.limit || 100);

    // Filter by resource type if specified
    if (args.resourceType) {
      logs = logs.filter((log) => log.resourceType === args.resourceType);
    }

    // Filter by action if specified
    if (args.action) {
      logs = logs.filter((log) => log.action === args.action);
    }

    // Enrich with user info
    const enrichedLogs = await Promise.all(
      logs.map(async (log) => {
        const user = await ctx.db.get(log.userId);
        return {
          ...log,
          user: user
            ? {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
              }
            : null,
        };
      })
    );

    return enrichedLogs;
  },
});

/**
 * Get distinct resource types for filtering
 */
export const getResourceTypes = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const logs = await ctx.db.query("audit_logs").take(500);
    const types = [...new Set(logs.map((log) => log.resourceType))];
    return types.sort();
  },
});

/**
 * Get distinct actions for filtering
 */
export const getActions = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const logs = await ctx.db.query("audit_logs").take(500);
    const actions = [...new Set(logs.map((log) => log.action))];
    return actions.sort();
  },
});
