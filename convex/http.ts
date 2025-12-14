import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

/**
 * Twilio SMS Webhook
 * Receives inbound SMS messages from Twilio when providers reply
 *
 * Configure in Twilio Console:
 * Phone Numbers → Your Number → Messaging → "A message comes in"
 * URL: https://amiable-frog-863.convex.site/twilio/sms
 * Method: POST
 */
http.route({
  path: "/twilio/sms",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      // Parse the form data from Twilio
      const formData = await request.formData();

      const fromPhone = formData.get("From") as string;
      const toPhone = formData.get("To") as string;
      const body = formData.get("Body") as string;
      const messageSid = formData.get("MessageSid") as string;

      if (!fromPhone || !body || !messageSid) {
        console.error("Missing required Twilio fields", { fromPhone, body, messageSid });
        return new Response("Missing required fields", { status: 400 });
      }

      console.log(`Inbound SMS from ${fromPhone}: "${body}"`);

      // Process the inbound message
      const result = await ctx.runMutation(internal.sms.processInboundSMS, {
        fromPhone,
        toPhone: toPhone || "",
        body,
        twilioSid: messageSid,
      });

      // Return TwiML response with auto-reply
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(result.autoReply)}</Message>
</Response>`;

      return new Response(twiml, {
        status: 200,
        headers: {
          "Content-Type": "text/xml",
        },
      });
    } catch (error) {
      console.error("Error processing inbound SMS:", error);

      // Return a generic error response as TwiML
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, we encountered an error processing your message. Please try again or contact your supervisor.</Message>
</Response>`;

      return new Response(twiml, {
        status: 200, // Return 200 even on error so Twilio doesn't retry
        headers: {
          "Content-Type": "text/xml",
        },
      });
    }
  }),
});

/**
 * Health check endpoint
 */
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

/**
 * Escape special XML characters for TwiML
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default http;
