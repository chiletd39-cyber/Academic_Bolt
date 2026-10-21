import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-internal-signature",
};

async function hmacHex(secret: string, msg: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const secret = Deno.env.get("INTERNAL_FN_SECRET") ?? "";
    const provided = req.headers.get("x-internal-signature") ?? "";
    const bodyText = await req.text();
    const expected = await hmacHex(secret, bodyText);
    if (!secret || provided !== expected) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Run DB sweep
    const { data: sweep, error: sweepErr } = await admin.rpc("run_retention_sweep");
    if (sweepErr) throw sweepErr;

    // Storage sweep
    const buckets = [
      { name: "exam-snapshots", ttl: 30 },
      { name: "recordings", ttl: 90 },
    ];
    const storageDeleted: Record<string, number> = {};
    for (const b of buckets) {
      const cutoff = Date.now() - b.ttl * 86_400_000;
      const { data: list } = await admin.storage.from(b.name).list("", { limit: 1000 });
      const expired = (list ?? []).filter((o) => {
        const t = o.created_at ? new Date(o.created_at).getTime() : 0;
        return t > 0 && t < cutoff;
      }).map((o) => o.name);
      if (expired.length) {
        await admin.storage.from(b.name).remove(expired);
      }
      storageDeleted[b.name] = expired.length;
    }

    return new Response(JSON.stringify({ ok: true, db: sweep, storage: storageDeleted }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("retention-sweep error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
