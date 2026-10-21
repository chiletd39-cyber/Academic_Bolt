// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser(token);
    if (uErr || !u?.user) return json({ error: "Invalid session" }, 401);
    const userId = u.user.id;

    const svc = createClient(SUPABASE_URL, SERVICE);

    // Get profile (name + role) before delete
    const { data: profile } = await svc.from("profiles").select("full_name, role").eq("user_id", userId).maybeSingle();
    const fullName = profile?.full_name || u.user.email || "Unknown user";
    const userRole = profile?.role || "user";

    // Notify all admins
    const { data: admins } = await svc.from("profiles").select("user_id").eq("role", "admin");
    if (admins?.length) {
      const rows = admins
        .filter((a: any) => a.user_id !== userId)
        .map((a: any) => ({
          user_id: a.user_id,
          title: "Account deleted",
          message: `${fullName} (${userRole}) deleted their account.`,
          type: "warning",
          link: "/dashboard/audit",
        }));
      if (rows.length) await svc.from("notifications").insert(rows);
    }

    // Audit log (using service role direct insert)
    await svc.from("audit_logs").insert({
      actor_id: userId,
      actor_name: fullName,
      actor_role: userRole,
      action_type: "delete",
      resource_type: "account",
      resource_id: userId,
      target_label: `Self-deleted account: ${fullName}`,
      metadata: { reason: "user_initiated", ts: new Date().toISOString() },
      device_info: { ua: req.headers.get("user-agent") || "" },
    });

    // Delete profile + auth user (cascades remove most relations)
    await svc.from("profiles").delete().eq("user_id", userId);
    const { error: dErr } = await svc.auth.admin.deleteUser(userId);
    if (dErr) return json({ error: dErr.message }, 500);

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
