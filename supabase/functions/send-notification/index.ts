import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

interface NotificationRequest {
  type: "warning" | "force_submit" | "exam_started" | "exam_ended";
  student_id: string;
  student_email?: string;
  student_name?: string;
  task_title?: string;
  warning_count?: number;
  max_warnings?: number;
  reason?: string;
}

async function sendEmail(to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Exam System <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${error}`);
  }

  return response.json();
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- AUTH CHECK ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Students can send notifications about themselves, staff can send for anyone
    const callerUserId = claimsData.claims.sub as string;
    // --- END AUTH CHECK ---

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      type, 
      student_id, 
      student_email, 
      student_name,
      task_title,
      warning_count,
      max_warnings,
      reason 
    }: NotificationRequest = await req.json();

    // Validate student_id is a UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(student_id)) {
      return new Response(JSON.stringify({ error: 'Invalid student_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate notification type
    if (!['warning', 'force_submit', 'exam_started', 'exam_ended'].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Invalid notification type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Students can only send notifications about themselves
    if (callerUserId !== student_id) {
      const { data: callerProfile } = await anonClient
        .from('profiles')
        .select('role')
        .eq('user_id', callerUserId)
        .single();
      
      if (!callerProfile || !['admin', 'teacher'].includes(callerProfile.role)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Get student email if not provided
    let email = student_email;
    let name = student_name;
    
    if (!email || !name) {
      const { data: userData } = await supabase.auth.admin.getUserById(student_id);
      if (userData?.user) {
        email = email || userData.user.email;
      }
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', student_id)
        .single();
      
      if (profile) {
        name = name || profile.full_name;
      }
    }

    if (!email) {
      return new Response(
        JSON.stringify({ error: "No email found for student" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Escape all user-provided content for HTML
    const safeName = esc(name || 'Student');
    const safeTaskTitle = esc(task_title || 'Exam');
    const safeReason = esc(reason || '');

    let subject = "";
    let htmlContent = "";

    switch (type) {
      case "warning":
        subject = `⚠️ Exam Warning - ${safeTaskTitle}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #f59e0b;">⚠️ Warning Notification</h1>
            <p>Dear ${safeName},</p>
            <p>You have received a warning during your examination: <strong>${safeTaskTitle}</strong></p>
            <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p><strong>Warning Count:</strong> ${Number(warning_count) || 1} / ${Number(max_warnings) || 3}</p>
              ${safeReason ? `<p><strong>Reason:</strong> ${safeReason}</p>` : ""}
            </div>
            <p style="color: #dc2626;"><strong>Important:</strong> If you reach ${Number(max_warnings) || 3} warnings, your exam will be automatically submitted.</p>
            <p>Please ensure you follow the examination rules to avoid further warnings.</p>
            <hr style="margin: 24px 0;" />
            <p style="color: #6b7280; font-size: 12px;">This is an automated notification from the Examination System.</p>
          </div>
        `;
        break;

      case "force_submit":
        subject = `🚨 Exam Force Submitted - ${safeTaskTitle}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dc2626;">🚨 Exam Force Submitted</h1>
            <p>Dear ${safeName},</p>
            <p>Your examination <strong>${safeTaskTitle}</strong> has been force submitted.</p>
            <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin: 16px 0;">
              ${safeReason ? `<p><strong>Reason:</strong> ${safeReason}</p>` : "<p>You exceeded the maximum number of warnings allowed.</p>"}
            </div>
            <p>Your answers have been saved and submitted for review. Please contact your instructor if you have any questions.</p>
            <hr style="margin: 24px 0;" />
            <p style="color: #6b7280; font-size: 12px;">This is an automated notification from the Examination System.</p>
          </div>
        `;
        break;

      case "exam_started":
        subject = `📝 Exam Started - ${safeTaskTitle}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #10b981;">📝 Examination Started</h1>
            <p>Dear ${safeName},</p>
            <p>You have started the examination: <strong>${safeTaskTitle}</strong></p>
            <p>Good luck!</p>
            <hr style="margin: 24px 0;" />
            <p style="color: #6b7280; font-size: 12px;">This is an automated notification from the Examination System.</p>
          </div>
        `;
        break;

      case "exam_ended":
        subject = `✅ Exam Submitted - ${safeTaskTitle}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #10b981;">✅ Exam Successfully Submitted</h1>
            <p>Dear ${safeName},</p>
            <p>Your examination <strong>${safeTaskTitle}</strong> has been successfully submitted.</p>
            <p>Your results will be available once reviewed by your instructor.</p>
            <hr style="margin: 24px 0;" />
            <p style="color: #6b7280; font-size: 12px;">This is an automated notification from the Examination System.</p>
          </div>
        `;
        break;
    }

    // Also create in-app notification
    await supabase.from('notifications').insert({
      user_id: student_id,
      title: subject,
      message: safeReason || `Notification for ${safeTaskTitle}`,
      type: type,
      is_read: false,
    });

    // Send email if RESEND_API_KEY is configured
    let emailResponse = null;
    if (RESEND_API_KEY) {
      try {
        emailResponse = await sendEmail(email, subject, htmlContent);
      } catch (emailError) {
        console.error("Failed to send email:", emailError);
      }
    }

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-notification function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
