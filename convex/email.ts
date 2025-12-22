"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

// ═══════════════════════════════════════════════════════════════════
// SENDGRID EMAIL INTEGRATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Send shift availability emails to selected providers
 * Uses SendGrid API to deliver personalized claim links
 */
export const sendShiftAvailabilityEmails = action({
  args: {
    scenarioId: v.id("strike_scenarios"),
    providerIds: v.array(v.id("providers")),
    customMessage: v.optional(v.string()),
    senderName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    sent: number;
    failed: number;
    errors: string[];
  }> => {
    // Get SendGrid API key from environment
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    if (!sendgridApiKey) {
      throw new Error("SENDGRID_API_KEY environment variable is not set");
    }

    // Get app URL for claim links
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    // First, generate claim tokens for all providers
    const tokenResult = await ctx.runMutation(api.claimTokens.generateClaimTokens, {
      scenarioId: args.scenarioId,
      providerIds: args.providerIds,
    });

    if (!tokenResult.tokens || tokenResult.tokens.length === 0) {
      return {
        success: false,
        sent: 0,
        failed: args.providerIds.length,
        errors: ["No tokens were generated"],
      };
    }

    const scenarioName = tokenResult.scenarioName;
    const senderName = args.senderName || "Strike Prep Team";

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    // Send emails to each provider
    for (const tokenData of tokenResult.tokens) {
      if (!tokenData.providerEmail) {
        failed++;
        errors.push(`${tokenData.providerName}: No email address on file`);
        continue;
      }

      const claimUrl = `${appUrl}/claim/${tokenData.token}`;

      const emailHtml = generateEmailHtml({
        providerName: tokenData.providerName,
        scenarioName,
        claimUrl,
        customMessage: args.customMessage,
        senderName,
      });

      const emailText = generateEmailText({
        providerName: tokenData.providerName,
        scenarioName,
        claimUrl,
        customMessage: args.customMessage,
        senderName,
      });

      try {
        const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${sendgridApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [
              {
                to: [{ email: tokenData.providerEmail, name: tokenData.providerName }],
              },
            ],
            from: {
              email: process.env.SENDGRID_FROM_EMAIL || "noreply@providerloop.com",
              name: senderName,
            },
            subject: `Available Shifts for ${scenarioName}`,
            content: [
              {
                type: "text/plain",
                value: emailText,
              },
              {
                type: "text/html",
                value: emailHtml,
              },
            ],
          }),
        });

        if (response.ok || response.status === 202) {
          sent++;
        } else {
          const errorBody = await response.text();
          failed++;
          errors.push(`${tokenData.providerName}: SendGrid error (${response.status})`);
          console.error(`SendGrid error for ${tokenData.providerEmail}:`, errorBody);
        }
      } catch (error: any) {
        failed++;
        errors.push(`${tokenData.providerName}: ${error.message}`);
        console.error(`Error sending to ${tokenData.providerEmail}:`, error);
      }
    }

    // Log the email send action
    await ctx.runMutation(internal.emailInternal.logEmailSend, {
      scenarioId: args.scenarioId,
      sent,
      failed,
      providerCount: tokenResult.tokens.length,
    });

    return {
      success: sent > 0,
      sent,
      failed,
      errors,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// EMAIL TEMPLATE HELPERS
// ═══════════════════════════════════════════════════════════════════

function generateEmailHtml({
  providerName,
  scenarioName,
  claimUrl,
  customMessage,
  senderName,
}: {
  providerName: string;
  scenarioName: string;
  claimUrl: string;
  customMessage?: string;
  senderName: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Available Shifts</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                Strike Prep
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <p style="margin: 0 0 20px; font-size: 18px; color: #1e293b;">
                Hello ${providerName},
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; color: #475569; line-height: 1.6;">
                Shifts are available for <strong>${scenarioName}</strong>. You can view and claim available shifts that match your skills and schedule.
              </p>

              ${customMessage ? `
              <div style="margin: 24px 0; padding: 16px; background-color: #f1f5f9; border-radius: 8px; border-left: 4px solid #10b981;">
                <p style="margin: 0; font-size: 14px; color: #475569; font-style: italic;">
                  "${customMessage}"
                </p>
              </div>
              ` : ''}

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${claimUrl}" style="display: inline-block; padding: 16px 40px; background-color: #10b981; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      View &amp; Claim Available Shifts
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                This link is unique to you and will expire after the scenario ends. Do not share this link with others.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #94a3b8;">
                Sent by ${senderName}
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #cbd5e1;">
                If you did not expect this email, please contact your department administrator.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function generateEmailText({
  providerName,
  scenarioName,
  claimUrl,
  customMessage,
  senderName,
}: {
  providerName: string;
  scenarioName: string;
  claimUrl: string;
  customMessage?: string;
  senderName: string;
}): string {
  return `
Hello ${providerName},

Shifts are available for ${scenarioName}. You can view and claim available shifts that match your skills and schedule.

${customMessage ? `Message from your administrator:\n"${customMessage}"\n` : ''}

Click the link below to view and claim shifts:
${claimUrl}

This link is unique to you and will expire after the scenario ends. Do not share this link with others.

---
Sent by ${senderName}
If you did not expect this email, please contact your department administrator.
  `.trim();
}
