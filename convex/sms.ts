import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════
// INTERNAL QUERIES (to avoid circular type references)
// ═══════════════════════════════════════════════════════════════════

export const getProviderForSMS = internalQuery({
  args: { providerId: v.id("providers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.providerId);
  },
});

export const getCurrentUserForSMS = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
  },
});

// ═══════════════════════════════════════════════════════════════════
// SMS SENDING ACTION
// Uses Twilio API to send SMS messages
// ═══════════════════════════════════════════════════════════════════

/**
 * Send SMS to a single provider
 * This is an action because it makes external HTTP requests to Twilio
 */
export const sendSMS = action({
  args: {
    providerId: v.id("providers"),
    messageType: v.string(), // "coverage_request" | "shift_confirmation" | "custom"
    customMessage: v.optional(v.string()),
    scenarioId: v.optional(v.id("strike_scenarios")),
    scenarioPositionId: v.optional(v.id("scenario_positions")),
  },
  handler: async (ctx, args): Promise<{ success: boolean; twilioSid?: string; to: string }> => {
    // Get the provider details using internal query
    const provider = await ctx.runQuery(internal.sms.getProviderForSMS, {
      providerId: args.providerId,
    });

    if (!provider) {
      throw new Error("Provider not found");
    }

    if (!provider.cellPhone) {
      throw new Error("Provider has no phone number");
    }

    // Check if provider has opted out of SMS
    if (provider.smsOptOut) {
      throw new Error("Provider has opted out of SMS messages");
    }

    // Get the current user record using internal query
    const user = await ctx.runQuery(internal.sms.getCurrentUserForSMS, {});
    if (!user) {
      throw new Error("User not found or not authenticated");
    }

    // Determine health system ID
    const healthSystemId = user.healthSystemId;
    if (!healthSystemId) {
      throw new Error("User must be associated with a health system to send SMS");
    }

    // Build the message based on type
    let message: string = args.customMessage || "";

    if (args.messageType === "coverage_request" && !args.customMessage) {
      message = `Hi ${provider.firstName}, we have strike coverage shifts available. Reply YES if you're interested in picking up extra shifts, or call us for more details.`;
    } else if (args.messageType === "shift_confirmation" && !args.customMessage) {
      message = `Hi ${provider.firstName}, this is a confirmation of your assigned shift. Please reply CONFIRM to acknowledge receipt.`;
    }

    if (!message) {
      throw new Error("Message content is required");
    }

    // Format phone number (ensure E.164 format)
    let toPhone: string = provider.cellPhone.replace(/\D/g, "");
    if (toPhone.length === 10) {
      toPhone = "+1" + toPhone;
    } else if (!toPhone.startsWith("+")) {
      toPhone = "+" + toPhone;
    }

    // Get Twilio credentials from environment
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromPhone) {
      // Log the SMS without actually sending (for testing without Twilio configured)
      console.log("Twilio not configured - logging SMS without sending");
      await ctx.runMutation(internal.sms.logSMS, {
        sentBy: user._id,
        healthSystemId,
        providerId: args.providerId,
        toPhone,
        providerName: `${provider.firstName} ${provider.lastName}`,
        messageType: args.messageType,
        message,
        scenarioId: args.scenarioId,
        scenarioPositionId: args.scenarioPositionId,
        status: "failed",
        errorMessage: "Twilio credentials not configured",
      });
      throw new Error("Twilio credentials not configured. Please add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to your Convex environment variables.");
    }

    // Send via Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = btoa(`${accountSid}:${authToken}`);

    try {
      const response: Response = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: toPhone,
          From: fromPhone,
          Body: message,
        }),
      });

      const result: { sid?: string; message?: string } = await response.json();

      if (!response.ok) {
        // Log failed attempt
        await ctx.runMutation(internal.sms.logSMS, {
          sentBy: user._id,
          healthSystemId,
          providerId: args.providerId,
          toPhone,
          providerName: `${provider.firstName} ${provider.lastName}`,
          messageType: args.messageType,
          message,
          scenarioId: args.scenarioId,
          scenarioPositionId: args.scenarioPositionId,
          status: "failed",
          errorMessage: result.message || "Twilio API error",
        });
        throw new Error(`Twilio error: ${result.message || "Unknown error"}`);
      }

      // Log successful send
      await ctx.runMutation(internal.sms.logSMS, {
        sentBy: user._id,
        healthSystemId,
        providerId: args.providerId,
        toPhone,
        providerName: `${provider.firstName} ${provider.lastName}`,
        messageType: args.messageType,
        message,
        scenarioId: args.scenarioId,
        scenarioPositionId: args.scenarioPositionId,
        status: "sent",
        twilioSid: result.sid,
      });

      return {
        success: true,
        twilioSid: result.sid,
        to: toPhone,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Log the error if not already logged
      if (!errorMessage.includes("Twilio error:")) {
        await ctx.runMutation(internal.sms.logSMS, {
          sentBy: user._id,
          healthSystemId,
          providerId: args.providerId,
          toPhone,
          providerName: `${provider.firstName} ${provider.lastName}`,
          messageType: args.messageType,
          message,
          scenarioId: args.scenarioId,
          scenarioPositionId: args.scenarioPositionId,
          status: "failed",
          errorMessage,
        });
      }
      throw error;
    }
  },
});

/**
 * Send SMS to multiple providers (bulk send)
 */
export const sendBulkSMS = action({
  args: {
    providerIds: v.array(v.id("providers")),
    messageType: v.string(),
    customMessage: v.optional(v.string()),
    scenarioId: v.optional(v.id("strike_scenarios")),
  },
  handler: async (ctx, args): Promise<{
    total: number;
    sent: number;
    failed: number;
    results: { providerId: string; success: boolean; error?: string }[];
  }> => {
    const results: { providerId: string; success: boolean; error?: string }[] = [];

    for (const providerId of args.providerIds) {
      try {
        // Get provider details
        const provider = await ctx.runQuery(internal.sms.getProviderForSMS, {
          providerId,
        });

        if (!provider) {
          results.push({ providerId, success: false, error: "Provider not found" });
          continue;
        }

        if (!provider.cellPhone) {
          results.push({ providerId, success: false, error: "No phone number" });
          continue;
        }

        // Check if provider has opted out
        if (provider.smsOptOut) {
          results.push({ providerId, success: false, error: "Provider opted out" });
          continue;
        }

        // Get user
        const user = await ctx.runQuery(internal.sms.getCurrentUserForSMS, {});
        if (!user || !user.healthSystemId) {
          results.push({ providerId, success: false, error: "User not found" });
          continue;
        }

        // Build message
        let message: string = args.customMessage || "";
        if (args.messageType === "coverage_request" && !args.customMessage) {
          message = `Hi ${provider.firstName}, we have strike coverage shifts available. Reply YES if you're interested in picking up extra shifts, or call us for more details.`;
        } else if (args.messageType === "shift_confirmation" && !args.customMessage) {
          message = `Hi ${provider.firstName}, this is a confirmation of your assigned shift. Please reply CONFIRM to acknowledge receipt.`;
        }

        // Format phone
        let toPhone: string = provider.cellPhone.replace(/\D/g, "");
        if (toPhone.length === 10) {
          toPhone = "+1" + toPhone;
        } else if (!toPhone.startsWith("+")) {
          toPhone = "+" + toPhone;
        }

        // Get Twilio credentials
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromPhone = process.env.TWILIO_PHONE_NUMBER;

        if (!accountSid || !authToken || !fromPhone) {
          await ctx.runMutation(internal.sms.logSMS, {
            sentBy: user._id,
            healthSystemId: user.healthSystemId,
            providerId,
            toPhone,
            providerName: `${provider.firstName} ${provider.lastName}`,
            messageType: args.messageType,
            message,
            scenarioId: args.scenarioId,
            status: "failed",
            errorMessage: "Twilio not configured",
          });
          results.push({ providerId, success: false, error: "Twilio not configured" });
          continue;
        }

        // Send via Twilio
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const auth = btoa(`${accountSid}:${authToken}`);

        const response: Response = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: toPhone,
            From: fromPhone,
            Body: message,
          }),
        });

        const twilioResult: { sid?: string; message?: string } = await response.json();

        if (!response.ok) {
          await ctx.runMutation(internal.sms.logSMS, {
            sentBy: user._id,
            healthSystemId: user.healthSystemId,
            providerId,
            toPhone,
            providerName: `${provider.firstName} ${provider.lastName}`,
            messageType: args.messageType,
            message,
            scenarioId: args.scenarioId,
            status: "failed",
            errorMessage: twilioResult.message || "Twilio API error",
          });
          results.push({ providerId, success: false, error: twilioResult.message });
        } else {
          await ctx.runMutation(internal.sms.logSMS, {
            sentBy: user._id,
            healthSystemId: user.healthSystemId,
            providerId,
            toPhone,
            providerName: `${provider.firstName} ${provider.lastName}`,
            messageType: args.messageType,
            message,
            scenarioId: args.scenarioId,
            status: "sent",
            twilioSid: twilioResult.sid,
          });
          results.push({ providerId, success: true });
        }
      } catch (error) {
        results.push({
          providerId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return {
      total: args.providerIds.length,
      sent: successCount,
      failed: failCount,
      results,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS (for logging)
// ═══════════════════════════════════════════════════════════════════

export const logSMS = internalMutation({
  args: {
    // Direction and threading
    direction: v.optional(v.string()), // "outbound" | "inbound"
    replyToSmsLogId: v.optional(v.id("sms_logs")),
    // Who sent (outbound)
    sentBy: v.optional(v.id("users")),
    healthSystemId: v.optional(v.id("health_systems")),
    // Provider info
    providerId: v.optional(v.id("providers")),
    toPhone: v.string(),
    fromPhone: v.optional(v.string()),
    providerName: v.optional(v.string()),
    // Message content
    messageType: v.string(),
    message: v.string(),
    replyIntent: v.optional(v.string()),
    // Context
    scenarioId: v.optional(v.id("strike_scenarios")),
    scenarioPositionId: v.optional(v.id("scenario_positions")),
    // Status
    status: v.string(),
    twilioSid: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sms_logs", {
      direction: args.direction || "outbound",
      replyToSmsLogId: args.replyToSmsLogId,
      sentBy: args.sentBy,
      healthSystemId: args.healthSystemId,
      providerId: args.providerId,
      toPhone: args.toPhone,
      fromPhone: args.fromPhone,
      providerName: args.providerName,
      messageType: args.messageType,
      message: args.message,
      replyIntent: args.replyIntent,
      scenarioId: args.scenarioId,
      scenarioPositionId: args.scenarioPositionId,
      status: args.status,
      twilioSid: args.twilioSid,
      errorMessage: args.errorMessage,
      sentAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Get SMS logs for a provider
 */
export const getProviderSMSLogs = query({
  args: {
    providerId: v.id("providers"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sms_logs")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .order("desc")
      .take(50);
  },
});

/**
 * Get recent SMS logs for a health system
 */
export const getRecentSMSLogs = query({
  args: {
    healthSystemId: v.id("health_systems"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sms_logs")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", args.healthSystemId))
      .order("desc")
      .take(args.limit || 100);
  },
});

/**
 * Test SMS - send directly to any phone number (for testing)
 */
export const testSMS = action({
  args: {
    toPhone: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; sid?: string; error?: string }> => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromPhone) {
      return { success: false, error: "Twilio credentials not configured" };
    }

    // Format phone number
    let toPhone = args.toPhone.replace(/\D/g, "");
    if (toPhone.length === 10) {
      toPhone = "+1" + toPhone;
    } else if (!toPhone.startsWith("+")) {
      toPhone = "+" + toPhone;
    }

    const message = args.message || "Test message from Strike Prep. If you received this, SMS is working!";

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = btoa(`${accountSid}:${authToken}`);

    try {
      const response = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: toPhone,
          From: fromPhone,
          Body: message,
        }),
      });

      const result: { sid?: string; message?: string; code?: number } = await response.json();

      if (!response.ok) {
        return { success: false, error: result.message || `Error ${result.code}` };
      }

      return { success: true, sid: result.sid };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

/**
 * Get all recent SMS logs (for debugging)
 */
export const getAllRecentLogs = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("sms_logs")
      .order("desc")
      .take(20);
  },
});

/**
 * Get SMS stats for dashboard
 */
export const getSMSStats = query({
  args: {
    healthSystemId: v.id("health_systems"),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("sms_logs")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", args.healthSystemId))
      .collect();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const todayLogs = logs.filter((l) => l.sentAt >= todayMs);

    return {
      totalSent: logs.length,
      sentToday: todayLogs.length,
      successRate: logs.length > 0
        ? Math.round((logs.filter((l) => l.status === "sent" || l.status === "delivered").length / logs.length) * 100)
        : 0,
      byType: {
        coverage_request: logs.filter((l) => l.messageType === "coverage_request").length,
        shift_confirmation: logs.filter((l) => l.messageType === "shift_confirmation").length,
        custom: logs.filter((l) => l.messageType === "custom").length,
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// INBOUND SMS PROCESSING
// ═══════════════════════════════════════════════════════════════════

/**
 * Normalize phone number to E.164 format for consistent lookup
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return "+1" + digits;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    return "+" + digits;
  } else if (!digits.startsWith("+")) {
    return "+" + digits;
  }
  return phone;
}

/**
 * Parse reply intent from message body
 */
function parseReplyIntent(body: string): string {
  const text = body.trim().toUpperCase();

  // STOP - must handle first (regulatory requirement)
  if (["STOP", "UNSUBSCRIBE", "QUIT", "END", "CANCEL"].includes(text)) {
    return "stop";
  }

  // HELP
  if (["HELP", "INFO", "?"].includes(text)) {
    return "help";
  }

  // START (re-subscribe)
  if (["START", "SUBSCRIBE", "RESUME", "UNSTOP"].includes(text)) {
    return "resubscribe";
  }

  // Confirmation
  if (["CONFIRM", "YES", "ACCEPT", "OK", "Y", "CONFIRMED"].includes(text)) {
    return "confirmed";
  }

  // Decline
  if (["NO", "DECLINE", "N", "REJECT", "PASS"].includes(text)) {
    return "declined";
  }

  // Interest (for coverage requests)
  if (["INTERESTED", "AVAILABLE", "SIGN ME UP", "COUNT ME IN"].includes(text) ||
      text.includes("INTERESTED") || text.includes("AVAILABLE")) {
    return "interested";
  }

  return "unclear";
}

/**
 * Get auto-reply message based on intent
 */
function getAutoReplyMessage(intent: string, providerName?: string): string {
  switch (intent) {
    case "stop":
      return "You've been unsubscribed from Strike Prep alerts. Reply START to re-subscribe.";
    case "help":
      return "Strike Prep SMS alerts. Reply CONFIRM to accept shifts, NO to decline, STOP to unsubscribe. Questions? Contact your supervisor.";
    case "resubscribe":
      return "Welcome back! You've been re-subscribed to Strike Prep SMS alerts.";
    case "confirmed":
      return `Thanks${providerName ? `, ${providerName}` : ""}! Your shift has been confirmed.`;
    case "declined":
      return "We've received your decline. Contact your supervisor if you have questions.";
    case "interested":
      return "Thanks for your interest! A scheduler will contact you about available shifts.";
    case "unclear":
    default:
      return "We didn't understand your reply. Please reply CONFIRM, YES, NO, or STOP.";
  }
}

/**
 * Find provider by phone number
 */
export const findProviderByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const normalizedPhone = normalizePhone(args.phone);

    // Try exact match first
    let provider = await ctx.db
      .query("providers")
      .withIndex("by_cell_phone", (q) => q.eq("cellPhone", normalizedPhone))
      .first();

    if (provider) return provider;

    // Try without country code
    const digitsOnly = args.phone.replace(/\D/g, "");
    if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
      const tenDigit = digitsOnly.slice(1);
      provider = await ctx.db
        .query("providers")
        .withIndex("by_cell_phone", (q) => q.eq("cellPhone", tenDigit))
        .first();
      if (provider) return provider;

      // Try with +1 prefix
      provider = await ctx.db
        .query("providers")
        .withIndex("by_cell_phone", (q) => q.eq("cellPhone", "+1" + tenDigit))
        .first();
    }

    return provider;
  },
});

/**
 * Find most recent outbound message to a provider for threading
 */
export const findRecentOutboundToProvider = internalQuery({
  args: { providerId: v.id("providers") },
  handler: async (ctx, args) => {
    // Get the most recent outbound message to this provider
    const recentMessages = await ctx.db
      .query("sms_logs")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .order("desc")
      .take(10);

    // Find the most recent outbound message
    return recentMessages.find(
      (m) => m.direction === "outbound" || !m.direction // backwards compat
    );
  },
});

/**
 * Handle opt-out (STOP)
 */
export const handleOptOut = internalMutation({
  args: { providerId: v.id("providers"), optOut: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.providerId, {
      smsOptOut: args.optOut,
    });
  },
});

/**
 * Handle shift confirmation via SMS
 */
export const handleShiftConfirmation = internalMutation({
  args: {
    scenarioPositionId: v.id("scenario_positions"),
    providerId: v.id("providers"),
    confirm: v.boolean(), // true = confirm, false = decline
  },
  handler: async (ctx, args) => {
    // Find the assignment for this provider and position
    const assignment = await ctx.db
      .query("scenario_assignments")
      .withIndex("by_position", (q) => q.eq("scenarioPositionId", args.scenarioPositionId))
      .filter((q) => q.eq(q.field("providerId"), args.providerId))
      .first();

    if (!assignment) {
      console.log("No assignment found for provider/position");
      return { success: false, error: "No assignment found" };
    }

    if (args.confirm) {
      // Confirm the assignment
      await ctx.db.patch(assignment._id, {
        status: "Confirmed",
      });

      // Also update position status
      await ctx.db.patch(args.scenarioPositionId, {
        status: "Confirmed",
      });

      return { success: true, action: "confirmed" };
    } else {
      // Decline - cancel assignment and reopen position
      await ctx.db.patch(assignment._id, {
        status: "Cancelled",
        cancelledAt: Date.now(),
        cancelReason: "Declined via SMS",
      });

      // Reopen the position
      await ctx.db.patch(args.scenarioPositionId, {
        status: "Open",
      });

      return { success: true, action: "declined" };
    }
  },
});

/**
 * Process inbound SMS - main handler called from HTTP webhook
 */
export const processInboundSMS = internalMutation({
  args: {
    fromPhone: v.string(),
    toPhone: v.string(),
    body: v.string(),
    twilioSid: v.string(),
  },
  handler: async (ctx, args): Promise<{ autoReply: string; intent: string }> => {
    const normalizedFrom = normalizePhone(args.fromPhone);
    const intent = parseReplyIntent(args.body);

    // Find the provider by phone number
    const provider = await ctx.db
      .query("providers")
      .withIndex("by_cell_phone", (q) => q.eq("cellPhone", normalizedFrom))
      .first();

    // Also try without +1 prefix for older records
    let matchedProvider = provider;
    if (!matchedProvider) {
      const digits = args.fromPhone.replace(/\D/g, "");
      if (digits.length === 11 && digits.startsWith("1")) {
        const tenDigit = digits.slice(1);
        matchedProvider = await ctx.db
          .query("providers")
          .withIndex("by_cell_phone", (q) => q.eq("cellPhone", tenDigit))
          .first();
      }
    }

    // Find recent outbound message for threading context
    let recentOutbound = null;
    if (matchedProvider) {
      const recentMessages = await ctx.db
        .query("sms_logs")
        .withIndex("by_provider", (q) => q.eq("providerId", matchedProvider._id))
        .order("desc")
        .take(10);

      recentOutbound = recentMessages.find(
        (m) => m.direction === "outbound" || !m.direction
      );
    }

    // Log the inbound message
    await ctx.db.insert("sms_logs", {
      direction: "inbound",
      replyToSmsLogId: recentOutbound?._id,
      providerId: matchedProvider?._id,
      toPhone: args.toPhone,
      fromPhone: normalizedFrom,
      providerName: matchedProvider
        ? `${matchedProvider.firstName} ${matchedProvider.lastName}`
        : undefined,
      messageType: "inbound_reply",
      message: args.body,
      replyIntent: intent,
      scenarioId: recentOutbound?.scenarioId,
      scenarioPositionId: recentOutbound?.scenarioPositionId,
      status: "received",
      twilioSid: args.twilioSid,
      sentAt: Date.now(),
    });

    // Handle special intents
    if (intent === "stop" && matchedProvider) {
      await ctx.db.patch(matchedProvider._id, { smsOptOut: true });
    } else if (intent === "resubscribe" && matchedProvider) {
      await ctx.db.patch(matchedProvider._id, { smsOptOut: false });
    } else if ((intent === "confirmed" || intent === "declined") && matchedProvider && recentOutbound?.scenarioPositionId) {
      // Handle shift confirmation/decline
      const positionId = recentOutbound.scenarioPositionId;
      const assignment = await ctx.db
        .query("scenario_assignments")
        .withIndex("by_position", (q) => q.eq("scenarioPositionId", positionId))
        .filter((q) => q.eq(q.field("providerId"), matchedProvider._id))
        .first();

      if (assignment && assignment.status === "Active") {
        if (intent === "confirmed") {
          await ctx.db.patch(assignment._id, { status: "Confirmed" });
          await ctx.db.patch(positionId, { status: "Confirmed" });
        } else {
          await ctx.db.patch(assignment._id, {
            status: "Cancelled",
            cancelledAt: Date.now(),
            cancelReason: "Declined via SMS",
          });
          await ctx.db.patch(positionId, { status: "Open" });
        }
      }
    }

    const autoReply = getAutoReplyMessage(intent, matchedProvider?.firstName);

    return { autoReply, intent };
  },
});

/**
 * Get conversation thread for a provider (both sent and received)
 */
export const getConversation = query({
  args: { providerId: v.id("providers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sms_logs")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .order("desc")
      .take(100);
  },
});

/**
 * Get messages needing review (unclear intent)
 */
export const getMessagesNeedingReview = query({
  args: { healthSystemId: v.optional(v.id("health_systems")) },
  handler: async (ctx, args) => {
    // Get inbound messages with unclear intent
    const allLogs = await ctx.db
      .query("sms_logs")
      .withIndex("by_direction", (q) => q.eq("direction", "inbound"))
      .order("desc")
      .take(200);

    const unclearMessages = allLogs.filter((log) => log.replyIntent === "unclear");

    // Filter by health system if specified
    if (args.healthSystemId) {
      return unclearMessages.filter((log) => log.healthSystemId === args.healthSystemId);
    }

    return unclearMessages;
  },
});
