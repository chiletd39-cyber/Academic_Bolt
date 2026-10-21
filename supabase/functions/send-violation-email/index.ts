import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// HTML escape helper to prevent injection
const esc = (s = '') => s.replace(/[<>&"']/g, c =>
  ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c] || c));

interface ViolationEmailRequest {
  taskId?: string;
  studentId?: string;
  taskTitle: string;
  violationType: string;
  violationMessage: string;
  warningCount: number;
  maxWarnings: number;
}

const getViolationIcon = (type: string) => {
  switch (type) {
    case 'external_display': return '🖥️';
    case 'screen_share': return '📺';
    case 'pip': return '🪟';
    case 'display_change': return '⚠️';
    case 'head': return '👤';
    case 'eye': return '👁️';
    case 'sound': return '🔊';
    case 'tab': return '📑';
    default: return '⚠️';
  }
};

async function hmacHex(secret: string, msg: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Read body once so HMAC and JSON both work
    const rawBody = await req.text();

    // --- AUTH: either user JWT or internal HMAC signature ---
    const authHeader = req.headers.get('Authorization');
    const internalSig = req.headers.get('x-internal-signature');
    const internalSecret = Deno.env.get('INTERNAL_FN_SECRET') ?? '';
    let callerId: string | null = null;
    let isInternal = false;

    if (internalSig && internalSecret) {
      const expected = await hmacHex(internalSecret, rawBody);
      if (internalSig === expected) {
        isInternal = true;
      }
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey,
      authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined as any
    );

    if (!isInternal) {
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      callerId = claimsData.claims.sub as string;
    }
    // --- END AUTH ---

    const {
      taskId,
      studentId,
      taskTitle,
      violationType,
      violationMessage,
      warningCount,
      maxWarnings,
    }: ViolationEmailRequest = JSON.parse(rawBody || "{}");

    // Service-role client to safely look up emails server-side
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Resolve target student id and authorize the caller (internal callers bypass role check)
    const { data: callerProfile } = callerId
      ? await adminClient.from("profiles").select("role, full_name").eq("user_id", callerId).maybeSingle()
      : { data: null as any };
    const callerRole = isInternal ? "admin" : (callerProfile?.role as string | undefined);

    let targetStudentId = studentId || callerId;
    if (!targetStudentId) {
      return new Response(JSON.stringify({ error: "studentId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (callerRole !== "admin" && callerRole !== "teacher" && targetStudentId !== callerId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }


    // For non-staff callers: verify the student is actually taking THIS exam.
    // Require either an active exam_sessions row or an in_progress task_submissions row.
    if (callerRole !== "admin" && callerRole !== "teacher") {
      if (!taskId) {
        return new Response(JSON.stringify({ error: "taskId required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const [{ data: sess }, { data: sub }] = await Promise.all([
        adminClient.from("exam_sessions")
          .select("id").eq("student_id", callerId).eq("task_id", taskId).eq("is_active", true).maybeSingle(),
        adminClient.from("task_submissions")
          .select("id,status").eq("student_id", callerId).eq("task_id", taskId).maybeSingle(),
      ]);
      const hasActive = !!sess || (sub && sub.status === "in_progress");
      if (!hasActive) {
        return new Response(JSON.stringify({ error: "No active exam session for this task" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Rate-limit: one email per student/task/violation-type per 5 minutes (best-effort via audit_logs lookback)
      const sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count } = await adminClient
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("actor_id", callerId)
        .eq("action_type", "violation_email_sent")
        .eq("resource_id", taskId)
        .gte("created_at", sinceIso);
      if ((count ?? 0) >= 1) {
        return new Response(JSON.stringify({ ok: true, throttled: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // Fetch student profile + email
    const { data: studentProfile } = await adminClient
      .from("profiles").select("user_id, full_name, current_class")
      .eq("user_id", targetStudentId).maybeSingle();
    if (!studentProfile) {
      return new Response(JSON.stringify({ error: "Student not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: studentAuth } = await adminClient.auth.admin.getUserById(targetStudentId);
    const studentEmail = studentAuth?.user?.email || "";
    const studentName = studentProfile.full_name || "Student";

    // Resolve verified parent emails (if any)
    const { data: links } = await adminClient
      .from("parent_children").select("parent_id")
      .eq("student_id", targetStudentId).eq("verified", true);
    const parentEmails: string[] = [];
    for (const l of links || []) {
      const { data: pa } = await adminClient.auth.admin.getUserById(l.parent_id);
      if (pa?.user?.email) parentEmails.push(pa.user.email);
    }

    // Resolve teacher email = task creator (if task provided)
    let teacherEmail = "";
    if (taskId) {
      const { data: task } = await adminClient
        .from("tasks").select("created_by").eq("id", taskId).maybeSingle();
      if (task?.created_by) {
        const { data: ta } = await adminClient.auth.admin.getUserById(task.created_by);
        teacherEmail = ta?.user?.email || "";
      }
    }

    // Validate and sanitize inputs
    const safeStudentName = esc(studentName);
    const safeTaskTitle = esc(taskTitle || 'Exam');
    const safeViolationType = esc(violationType || 'unknown');
    const safeViolationMessage = esc(violationMessage || 'Security violation detected');
    const safeWarningCount = Math.max(0, Math.min(Number(warningCount) || 0, 100));
    const safeMaxWarnings = Math.max(1, Math.min(Number(maxWarnings) || 3, 100));

    const icon = getViolationIcon(violationType);
    const timestamp = new Date().toLocaleString();
    const isForceSubmit = safeWarningCount >= safeMaxWarnings;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1a3a5c 0%, #2d5a87 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 10px 0 0; opacity: 0.9; }
    .content { padding: 30px; }
    .alert-box { background: ${isForceSubmit ? '#fee2e2' : '#fef3c7'}; border-left: 4px solid ${isForceSubmit ? '#dc2626' : '#f59e0b'}; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
    .alert-title { font-weight: 600; color: ${isForceSubmit ? '#dc2626' : '#d97706'}; margin-bottom: 5px; font-size: 16px; }
    .alert-message { color: #374151; font-size: 14px; }
    .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #6b7280; font-size: 14px; }
    .detail-value { font-weight: 500; color: #111827; font-size: 14px; }
    .warning-badge { display: inline-block; background: ${safeWarningCount >= safeMaxWarnings - 1 ? '#dc2626' : '#f59e0b'}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
    .icon { font-size: 40px; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">${icon}</div>
      <h1>Exam Security Alert</h1>
      <p>World Mission High School - Online Examination System</p>
    </div>
    <div class="content">
      <div class="alert-box">
        <div class="alert-title">${isForceSubmit ? '🚨 Exam Force-Submitted' : '⚠️ Security Violation Detected'}</div>
        <div class="alert-message">${safeViolationMessage}</div>
      </div>
      
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Student</span>
          <span class="detail-value">${safeStudentName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Exam/Task</span>
          <span class="detail-value">${safeTaskTitle}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Violation Type</span>
          <span class="detail-value" style="text-transform: capitalize;">${safeViolationType.replace('_', ' ')}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Time</span>
          <span class="detail-value">${timestamp}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Warning Status</span>
          <span class="warning-badge">${safeWarningCount} / ${safeMaxWarnings}</span>
        </div>
      </div>
      
      ${isForceSubmit ? `
      <p style="color: #dc2626; font-weight: 500; text-align: center;">
        The exam has been automatically submitted due to exceeding the maximum number of warnings.
      </p>
      ` : `
      <p style="color: #6b7280; text-align: center; font-size: 14px;">
        ${safeMaxWarnings - safeWarningCount} warning(s) remaining before automatic submission.
      </p>
      `}
    </div>
    <div class="footer">
      <p>This is an automated message from the Online Examination System.</p>
      <p>&copy; 2025 World Mission High School</p>
    </div>
  </div>
</body>
</html>
    `;

    const recipients: string[] = [];
    const results: { recipient: string; status: string }[] = [];

    // Validate email format before adding
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (studentEmail && emailRegex.test(studentEmail)) recipients.push(studentEmail);
    for (const pe of parentEmails) {
      if (emailRegex.test(pe)) recipients.push(pe);
    }
    if (teacherEmail && emailRegex.test(teacherEmail)) recipients.push(teacherEmail);

    for (const recipient of recipients) {
      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Exam Security <noreply@lovable.app>",
            to: [recipient],
            subject: isForceSubmit 
              ? `🚨 Exam Force-Submitted: ${safeStudentName} - ${safeTaskTitle}`
              : `⚠️ Exam Violation Alert: ${safeStudentName} - ${safeTaskTitle}`,
            html: emailHtml,
          }),
        });
        
        if (emailResponse.ok) {
          results.push({ recipient, status: 'sent' });
        } else {
          console.error(`Failed to send to ${recipient}`);
          results.push({ recipient, status: 'failed' });
        }
      } catch (emailError) {
        console.error(`Failed to send to ${recipient}:`, emailError);
        results.push({ recipient, status: 'failed' });
      }
    }

    // Audit-log this send so the rate-limiter can see it next time
    try {
      await adminClient.from("audit_logs").insert({
        actor_id: callerId,
        actor_name: callerProfile?.full_name ?? null,
        actor_role: callerRole ?? null,
        action_type: "violation_email_sent",
        resource_type: "task",
        resource_id: taskId ?? null,
        target_label: taskTitle ?? null,
        metadata: { violationType, warningCount: safeWarningCount },
      });
    } catch (_) { /* best effort */ }

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    console.error("Error in send-violation-email function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
