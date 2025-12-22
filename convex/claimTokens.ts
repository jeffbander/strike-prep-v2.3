import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireAuth, auditLog } from "./lib/auth";

// ═══════════════════════════════════════════════════════════════════
// CLAIM TOKEN GENERATION (Admin-only)
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate claim tokens for providers in a scenario
 * Returns tokens that can be sent via email for self-service shift claiming
 */
export const generateClaimTokens = mutation({
  args: {
    scenarioId: v.id("strike_scenarios"),
    providerIds: v.array(v.id("providers")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) throw new Error("Scenario not found");

    // Calculate expiration (scenario end date + 1 day)
    const endDate = new Date(scenario.endDate);
    endDate.setDate(endDate.getDate() + 1);
    endDate.setHours(23, 59, 59, 999);
    const expiresAt = endDate.getTime();

    const tokens: Array<{
      providerId: Id<"providers">;
      token: string;
      providerName: string;
      providerEmail: string | undefined;
    }> = [];

    for (const providerId of args.providerIds) {
      const provider = await ctx.db.get(providerId);
      if (!provider || !provider.isActive) continue;

      // Check if token already exists for this scenario/provider
      const existingToken = await ctx.db
        .query("claim_tokens")
        .withIndex("by_scenario_provider", (q) =>
          q.eq("scenarioId", args.scenarioId).eq("providerId", providerId)
        )
        .first();

      let token: string;

      if (existingToken) {
        // Reuse existing token
        token = existingToken.token;
      } else {
        // Generate new UUID token
        token = crypto.randomUUID();

        await ctx.db.insert("claim_tokens", {
          scenarioId: args.scenarioId,
          providerId,
          token,
          expiresAt,
          createdAt: Date.now(),
          createdBy: user._id,
        });
      }

      tokens.push({
        providerId,
        token,
        providerName: `${provider.firstName} ${provider.lastName}`,
        providerEmail: provider.email,
      });
    }

    await auditLog(ctx, user, "CREATE", "CLAIM_TOKEN", args.scenarioId, {
      providerCount: tokens.length,
      scenarioName: scenario.name,
    });

    return {
      scenarioId: args.scenarioId,
      scenarioName: scenario.name,
      tokens,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// PUBLIC QUERIES (No auth required - token is the auth)
// ═══════════════════════════════════════════════════════════════════

/**
 * Get claim data for a token (PUBLIC - no auth required)
 * Returns scenario info and available positions matching the provider's skills
 */
export const getClaimData = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Find token
    const claimToken = await ctx.db
      .query("claim_tokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!claimToken) {
      return { error: "Invalid or expired link", data: null };
    }

    // Check expiration
    if (Date.now() > claimToken.expiresAt) {
      return { error: "This link has expired", data: null };
    }

    // Get scenario
    const scenario = await ctx.db.get(claimToken.scenarioId);
    if (!scenario || !scenario.isActive) {
      return { error: "Scenario is no longer active", data: null };
    }

    // Get provider
    const provider = await ctx.db.get(claimToken.providerId);
    if (!provider || !provider.isActive) {
      return { error: "Provider not found", data: null };
    }

    // Get provider's job type
    const jobType = await ctx.db.get(provider.jobTypeId);

    // Get provider's skills
    const providerSkills = await ctx.db
      .query("provider_skills")
      .withIndex("by_provider", (q) => q.eq("providerId", provider._id))
      .collect();
    const providerSkillIds = new Set(providerSkills.map((ps) => ps.skillId.toString()));

    // Get provider's hospital access
    const hospitalAccess = await ctx.db
      .query("provider_hospital_access")
      .withIndex("by_provider", (q) => q.eq("providerId", provider._id))
      .collect();
    const accessibleHospitalIds = new Set([
      provider.hospitalId.toString(),
      ...hospitalAccess.map((ha) => ha.hospitalId.toString()),
    ]);

    // Get all open positions in this scenario matching provider's job type
    const positions = await ctx.db
      .query("scenario_positions")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", claimToken.scenarioId))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "Open"),
          q.eq(q.field("isActive"), true),
          q.eq(q.field("jobTypeId"), provider.jobTypeId)
        )
      )
      .collect();

    // Get existing assignments for this provider in this scenario
    const existingAssignments = await ctx.db
      .query("scenario_assignments")
      .withIndex("by_provider_scenario", (q) =>
        q.eq("providerId", provider._id).eq("scenarioId", claimToken.scenarioId)
      )
      .filter((q) => q.neq(q.field("status"), "Cancelled"))
      .collect();

    // Build a set of date+shift combos already assigned
    const assignedShifts = new Set<string>();
    for (const assignment of existingAssignments) {
      const pos = await ctx.db.get(assignment.scenarioPositionId);
      if (pos) {
        assignedShifts.add(`${pos.date}-${pos.shiftType}`);
      }
    }

    // Filter positions by hospital access and conflicts
    const availablePositions: Array<{
      positionId: Id<"scenario_positions">;
      date: string;
      shiftType: string;
      shiftStart: string;
      shiftEnd: string;
      serviceName: string;
      serviceCode: string;
      hospitalName: string;
      departmentName: string;
      skillMatch: "Perfect" | "Good" | "Partial";
      isHomeHospital: boolean;
    }> = [];

    for (const position of positions) {
      // Check hospital access
      if (!accessibleHospitalIds.has(position.hospitalId.toString())) {
        continue;
      }

      // Check visa restriction for fellows
      if (provider.hasVisa && jobType?.code === "FEL") {
        if (provider.hospitalId !== position.hospitalId) {
          continue;
        }
      }

      // Check for conflicts
      if (assignedShifts.has(`${position.date}-${position.shiftType}`)) {
        continue;
      }

      // Get service and hospital info
      const service = await ctx.db.get(position.serviceId);
      const hospital = await ctx.db.get(position.hospitalId);
      const department = await ctx.db.get(position.departmentId);

      // Check skill match
      const serviceJobType = await ctx.db.get(position.serviceJobTypeId);
      let skillMatch: "Perfect" | "Good" | "Partial" = "Perfect";

      if (serviceJobType) {
        const requiredSkillLinks = await ctx.db
          .query("service_job_type_skills")
          .withIndex("by_service_job_type", (q) =>
            q.eq("serviceJobTypeId", serviceJobType._id)
          )
          .filter((q) => q.eq(q.field("isRequired"), true))
          .collect();

        const requiredSkillIds = requiredSkillLinks.map((sl) => sl.skillId.toString());
        const matched = requiredSkillIds.filter((id) => providerSkillIds.has(id));
        const missing = requiredSkillIds.filter((id) => !providerSkillIds.has(id));

        if (missing.length === 0) {
          skillMatch = "Perfect";
        } else if (matched.length > missing.length) {
          skillMatch = "Good";
        } else {
          skillMatch = "Partial";
        }
      }

      availablePositions.push({
        positionId: position._id,
        date: position.date,
        shiftType: position.shiftType,
        shiftStart: position.shiftStart,
        shiftEnd: position.shiftEnd,
        serviceName: service?.name || "Unknown Service",
        serviceCode: service?.shortCode || "",
        hospitalName: hospital?.name || "Unknown Hospital",
        departmentName: department?.name || "Unknown Department",
        skillMatch,
        isHomeHospital: provider.hospitalId === position.hospitalId,
      });
    }

    // Sort by date, then by shift type (AM first)
    availablePositions.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.shiftType === "AM" ? -1 : 1;
    });

    // Group by date for easier display
    const positionsByDate: Record<string, typeof availablePositions> = {};
    for (const pos of availablePositions) {
      if (!positionsByDate[pos.date]) {
        positionsByDate[pos.date] = [];
      }
      positionsByDate[pos.date].push(pos);
    }

    return {
      error: null,
      data: {
        providerName: `${provider.firstName} ${provider.lastName}`,
        providerJobType: jobType?.name || "Unknown",
        scenarioName: scenario.name,
        scenarioStartDate: scenario.startDate,
        scenarioEndDate: scenario.endDate,
        availablePositions,
        positionsByDate,
        totalAvailable: availablePositions.length,
        alreadyAssigned: existingAssignments.length,
      },
    };
  },
});

/**
 * Get provider's current assignments for a scenario (via token)
 */
export const getMyAssignments = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const claimToken = await ctx.db
      .query("claim_tokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!claimToken || Date.now() > claimToken.expiresAt) {
      return { error: "Invalid or expired link", assignments: [] };
    }

    const assignments = await ctx.db
      .query("scenario_assignments")
      .withIndex("by_provider_scenario", (q) =>
        q.eq("providerId", claimToken.providerId).eq("scenarioId", claimToken.scenarioId)
      )
      .filter((q) => q.neq(q.field("status"), "Cancelled"))
      .collect();

    const enrichedAssignments = await Promise.all(
      assignments.map(async (assignment) => {
        const position = await ctx.db.get(assignment.scenarioPositionId);
        const service = position ? await ctx.db.get(position.serviceId) : null;
        const hospital = position ? await ctx.db.get(position.hospitalId) : null;

        return {
          assignmentId: assignment._id,
          date: position?.date || "",
          shiftType: position?.shiftType || "",
          shiftStart: position?.shiftStart || "",
          shiftEnd: position?.shiftEnd || "",
          serviceName: service?.name || "",
          hospitalName: hospital?.name || "",
          status: assignment.status,
          assignedAt: assignment.assignedAt,
        };
      })
    );

    return {
      error: null,
      assignments: enrichedAssignments.sort((a, b) => a.date.localeCompare(b.date)),
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// PUBLIC MUTATIONS (No auth required - token is the auth)
// ═══════════════════════════════════════════════════════════════════

/**
 * Claim positions (PUBLIC - no auth required, auto-approved)
 * Creates assignments for the selected positions
 */
export const claimPositions = mutation({
  args: {
    token: v.string(),
    positionIds: v.array(v.id("scenario_positions")),
  },
  handler: async (ctx, args) => {
    // Validate token
    const claimToken = await ctx.db
      .query("claim_tokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!claimToken) {
      throw new Error("Invalid or expired link");
    }

    if (Date.now() > claimToken.expiresAt) {
      throw new Error("This link has expired");
    }

    const scenario = await ctx.db.get(claimToken.scenarioId);
    if (!scenario || !scenario.isActive) {
      throw new Error("Scenario is no longer active");
    }

    const provider = await ctx.db.get(claimToken.providerId);
    if (!provider || !provider.isActive) {
      throw new Error("Provider not found");
    }

    // Get existing assignments to check for conflicts
    const existingAssignments = await ctx.db
      .query("scenario_assignments")
      .withIndex("by_provider_scenario", (q) =>
        q.eq("providerId", provider._id).eq("scenarioId", claimToken.scenarioId)
      )
      .filter((q) => q.neq(q.field("status"), "Cancelled"))
      .collect();

    const assignedShifts = new Set<string>();
    for (const assignment of existingAssignments) {
      const pos = await ctx.db.get(assignment.scenarioPositionId);
      if (pos) {
        assignedShifts.add(`${pos.date}-${pos.shiftType}`);
      }
    }

    // Get the user who created the token (for audit)
    const tokenCreator = await ctx.db.get(claimToken.createdBy);

    const claimed: Array<{ positionId: Id<"scenario_positions">; assignmentId: Id<"scenario_assignments"> }> = [];
    const errors: string[] = [];

    for (const positionId of args.positionIds) {
      const position = await ctx.db.get(positionId);

      if (!position) {
        errors.push(`Position not found`);
        continue;
      }

      if (position.scenarioId !== claimToken.scenarioId) {
        errors.push(`Position does not belong to this scenario`);
        continue;
      }

      if (position.status !== "Open") {
        errors.push(`Position for ${position.date} ${position.shiftType} is no longer available`);
        continue;
      }

      // Check for conflicts
      const shiftKey = `${position.date}-${position.shiftType}`;
      if (assignedShifts.has(shiftKey)) {
        errors.push(`Already assigned to ${position.shiftType} shift on ${position.date}`);
        continue;
      }

      // Create assignment (auto-approved - status is "Assigned")
      const assignmentId = await ctx.db.insert("scenario_assignments", {
        scenarioPositionId: positionId,
        providerId: provider._id,
        scenarioId: claimToken.scenarioId,
        status: "Active", // Auto-approved
        assignedAt: Date.now(),
        assignedBy: claimToken.createdBy, // Use token creator as the "assigner"
        notes: "Self-claimed via email link",
      });

      // Update position status
      await ctx.db.patch(positionId, { status: "Assigned" });

      // Mark this shift as assigned for conflict checking
      assignedShifts.add(shiftKey);

      claimed.push({ positionId, assignmentId });
    }

    // Log the claim (using a simple insert since we don't have auth context)
    if (tokenCreator) {
      await ctx.db.insert("audit_logs", {
        userId: tokenCreator._id,
        action: "SELF_CLAIM",
        resourceType: "SCENARIO_ASSIGNMENT",
        resourceId: claimToken.scenarioId,
        changes: {
          providerId: provider._id,
          providerName: `${provider.firstName} ${provider.lastName}`,
          claimedCount: claimed.length,
          positionIds: claimed.map((c) => c.positionId),
        },
        timestamp: Date.now(),
      });
    }

    return {
      success: true,
      claimed: claimed.length,
      errors,
      message:
        claimed.length > 0
          ? `Successfully claimed ${claimed.length} shift${claimed.length > 1 ? "s" : ""}`
          : "No shifts were claimed",
    };
  },
});

/**
 * Unclaim/cancel a position (PUBLIC - provider can cancel their own claims)
 */
export const unclaimPosition = mutation({
  args: {
    token: v.string(),
    assignmentId: v.id("scenario_assignments"),
  },
  handler: async (ctx, args) => {
    // Validate token
    const claimToken = await ctx.db
      .query("claim_tokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!claimToken) {
      throw new Error("Invalid or expired link");
    }

    if (Date.now() > claimToken.expiresAt) {
      throw new Error("This link has expired");
    }

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }

    // Verify this assignment belongs to the token's provider
    if (assignment.providerId !== claimToken.providerId) {
      throw new Error("You can only cancel your own assignments");
    }

    if (assignment.scenarioId !== claimToken.scenarioId) {
      throw new Error("Assignment does not belong to this scenario");
    }

    if (assignment.status === "Cancelled") {
      throw new Error("Assignment is already cancelled");
    }

    // Cancel the assignment
    await ctx.db.patch(args.assignmentId, {
      status: "Cancelled",
      cancelledAt: Date.now(),
      cancelReason: "Self-cancelled via claim portal",
    });

    // Revert position status to Open
    await ctx.db.patch(assignment.scenarioPositionId, { status: "Open" });

    return { success: true, message: "Shift cancelled successfully" };
  },
});
