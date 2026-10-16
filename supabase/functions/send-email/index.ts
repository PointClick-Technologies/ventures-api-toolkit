import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function makeSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  triggerId?: string;
  triggerName?: string;
  recipientType?: string;
  notificationType?: string;
  context?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const {
      to, subject, body,
      triggerId, triggerName, recipientType,
      notificationType = "email",
      context = {},
    } = await req.json() as SendEmailRequest;

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: to, subject, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = makeSupabase();

    // Insert a pending log entry
    const { data: logEntry, error: logError } = await supabase
      .from("notification_log")
      .insert({
        trigger_id: triggerId || null,
        trigger_name: triggerName || null,
        recipient: to,
        recipient_type: recipientType || null,
        subject,
        body,
        notification_type: notificationType,
        status: "pending",
        context,
      })
      .select()
      .single();

    if (logError) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to create log entry: ${logError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      // No API key configured — update log as failed with helpful message
      await supabase
        .from("notification_log")
        .update({
          status: "failed",
          error_message: "RESEND_API_KEY is not configured. Add it as an edge function secret.",
        })
        .eq("id", logEntry.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Email sending is not configured. The RESEND_API_KEY secret needs to be set on the edge function. See Settings → Notification Configuration.",
          logId: logEntry.id,
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";
    const fromName = Deno.env.get("RESEND_FROM_NAME") || "Ventures Toolkit";
    const fromAddress = `${fromName} <${fromEmail}>`;

    // Send via Resend API
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        text: body,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      const errMsg = resendData?.message || resendData?.error || `Resend API returned ${resendResponse.status}`;
      await supabase
        .from("notification_log")
        .update({ status: "failed", error_message: errMsg })
        .eq("id", logEntry.id);

      return new Response(
        JSON.stringify({ success: false, error: errMsg, logId: logEntry.id }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Success — update log with provider ID
    const providerId = resendData?.id || null;
    await supabase
      .from("notification_log")
      .update({ status: "sent", provider_id: providerId })
      .eq("id", logEntry.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
        providerId,
        logId: logEntry.id,
        recipient: to,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
