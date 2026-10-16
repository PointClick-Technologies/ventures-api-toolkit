import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const VENTURES_BASE = "https://api.venturesgo.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Accept, X-Session-ID",
};

function makeSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    const idx = url.pathname.indexOf("/api/v4");
    const targetPath = idx >= 0 ? url.pathname.slice(idx) : "/";
    const isTokenEndpoint = targetPath === "/api/v4/token";

    const targetUrl = `${VENTURES_BASE}${targetPath}${url.search}`;

    const forwardHeaders: Record<string, string> = {
      Accept: req.headers.get("Accept") || "application/json",
    };

    if (!isTokenEndpoint) {
      // Resolve the opaque session ID to the real Ventures JWT server-side.
      // This avoids passing the JWT through browser-visible headers where
      // Supabase infrastructure would intercept / overwrite it.
      const sessionId = req.headers.get("X-Session-ID");
      if (!sessionId) {
        return new Response(
          JSON.stringify({ result: null, succeeded: false, messages: ["Missing session ID — please reconnect"] }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const supabase = makeSupabase();
      const { data: session } = await supabase
        .from("ventures_sessions")
        .select("jwt, expires_at")
        .eq("id", sessionId)
        .maybeSingle();

      if (!session || new Date(session.expires_at) <= new Date()) {
        return new Response(
          JSON.stringify({ result: null, succeeded: false, messages: ["Session expired — please reconnect"] }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      forwardHeaders["Authorization"] = `Bearer ${session.jwt}`;
    }

    const contentType = req.headers.get("Content-Type");
    if (contentType) forwardHeaders["Content-Type"] = contentType;

    let body: ArrayBuffer | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = await req.arrayBuffer();
    }

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
    });

    if (isTokenEndpoint && upstream.ok) {
      // Intercept the Ventures token response: store the real JWT in the DB
      // and return an opaque session UUID to the browser instead.
      const tokenData = await upstream.json();
      const venturesJwt: string =
        tokenData?.result?.token ||
        tokenData?.result?.access_token ||
        tokenData?.access_token ||
        tokenData?.token ||
        "";

      if (venturesJwt) {
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

        const supabase = makeSupabase();

        // Clean up expired sessions while we're here
        await supabase.from("ventures_sessions").delete().lt("expires_at", new Date().toISOString());

        const { error: insertError } = await supabase
          .from("ventures_sessions")
          .insert({ id: sessionId, jwt: venturesJwt, expires_at: expiresAt });

        if (insertError) {
          return new Response(
            JSON.stringify({ result: null, succeeded: false, messages: ["Failed to create session — please try again"] }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ ...tokenData, result: { ...tokenData.result, token: sessionId } }),
          { status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // No JWT found in token response — return the upstream body as-is
      return new Response(JSON.stringify(tokenData), {
        status: upstream.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const responseBody = await upstream.arrayBuffer();
    const responseHeaders = new Headers(corsHeaders);
    const ct = upstream.headers.get("Content-Type");
    if (ct) responseHeaders.set("Content-Type", ct);

    return new Response(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
