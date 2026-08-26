import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // 1. Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. Validate Authorization header presence
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Initialize Supabase Admin Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Server environment variable missing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 4. Verify caller authentication token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token session.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Verify caller has ADMIN role
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('account_type')
      .eq('id', caller.id)
      .single();

    if (profileError || callerProfile?.account_type !== 'ADMIN') {
      return new Response(
        JSON.stringify({ error: 'Access denied: Admins only.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Parse target payload
    const { targetEmail, targetUserId } = await req.json();
    let emailToUse = targetEmail;

    // Fallback: Query auth.users if email is missing from target record
    if (!emailToUse && targetUserId) {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      if (userError || !userData?.user?.email) {
        return new Response(
          JSON.stringify({ error: 'Could not resolve a registered email for this user ID.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      emailToUse = userData.user.email;
    }

    if (!emailToUse) {
      return new Response(
        JSON.stringify({ error: 'Target email or user ID is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Generate single-use login link
    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: emailToUse,
    });

    if (linkError) throw linkError;

    return new Response(
      JSON.stringify({ action_link: data.properties.action_link }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'An unexpected error occurred.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});