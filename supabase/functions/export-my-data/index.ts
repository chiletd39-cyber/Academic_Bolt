import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await anon.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const uid = claims.claims.sub as string;
    const admin = createClient(supabaseUrl, serviceKey);

    const tables: Record<string, any> = {};
    const pickByUser = async (table: string, column: string) => {
      const { data } = await admin.from(table).select("*").eq(column, uid);
      tables[table] = data ?? [];
    };
    await Promise.all([
      pickByUser("profiles", "user_id"),
      pickByUser("task_submissions", "student_id"),
      pickByUser("student_scores", "student_id"),
      pickByUser("notifications", "user_id"),
      pickByUser("parent_children", "parent_id"),
      pickByUser("parent_children", "student_id"),
      pickByUser("audit_logs", "actor_id"),
      pickByUser("pii_access_log", "subject_user_id"),
      pickByUser("class_switch_requests", "student_id"),
      pickByUser("comments", "user_id"),
    ]);

    const body = {
      exported_at: new Date().toISOString(),
      user_id: uid,
      tables,
    };
    return new Response(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="my-data-${uid}.json"`,
      },
    });
  } catch (e) {
    console.error("export-my-data error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
