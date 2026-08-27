import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server error: Missing SERVICE_ROLE_KEY environment secret." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate caller session
    const token = authHeader.replace("Bearer ", "");
    const supabaseCaller = createClient(supabaseUrl, anonKey);
    const {
      data: { user },
      error: userError,
    } = await supabaseCaller.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user session." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify ADMIN account type in database using service role client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .single();

    if (!profile || profile.account_type?.toUpperCase() !== "ADMIN") {
      return new Response(
        JSON.stringify({
          error: `Access denied: Signed-in as '${user.email}' (Role: '${
            profile?.account_type || "NONE"
          }'). Requires ADMIN role.`,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { targetEmail, customRedirect } = body;

    if (!targetEmail) {
      return new Response(JSON.stringify({ error: "Target email required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dynamically detect calling domain (works on both localhost and live domain)
    const clientOrigin = req.headers.get("origin") || "https://jb-premium-hub.vip";
    const redirectTo = customRedirect || clientOrigin;

    // Generate magic link with redirect target
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
      options: {
        redirectTo: redirectTo,
      },
    });

    if (linkError) throw linkError;

    return new Response(
      JSON.stringify({ action_link: linkData.properties?.action_link }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});