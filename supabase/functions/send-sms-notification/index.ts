import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SMSNotificationRequest {
  type: 'warning' | 'exam_completed' | 'exam_started' | 'force_submitted';
  student_id: string;
  student_name?: string;
  exam_name?: string;
  warning_count?: number;
  score?: number;
  message?: string;
}

async function sendTwilioSMS(to: string, message: string): Promise<{ success: boolean; error?: string }> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: "Twilio credentials not configured" };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          From: fromNumber,
          Body: message,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || "Failed to send SMS" };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

function escapeText(text: string): string {
  return text.replace(/[<>&"']/g, (char) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[char] || char;
  });
}

Deno.serve(async (req) => {
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
    // --- ROLE CHECK ---
    const { data: callerProfile } = await anonClient
      .from('profiles')
      .select('role')
      .eq('user_id', claimsData.claims.sub)
      .single();

    if (!callerProfile || !['admin', 'teacher'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    // --- END ROLE CHECK ---

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const request: SMSNotificationRequest = await req.json();
    const { type, student_id, student_name, exam_name, warning_count, score, message } = request;

    // Get student's profile
    const { data: studentProfile } = await supabase
      .from("profiles")
      .select("full_name, current_class")
      .eq("user_id", student_id)
      .single();

    const studentNameFinal = escapeText(student_name || studentProfile?.full_name || "Your child");
    const examNameFinal = escapeText(exam_name || "an exam");

    // Find parent(s) linked to this student
    const { data: parentLinks } = await supabase
      .from("parent_children")
      .select("parent_id")
      .eq("student_id", student_id)
      .eq("verified", true);

    if (!parentLinks || parentLinks.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No verified parents linked to student" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parentIds = parentLinks.map(l => l.parent_id);

    // Get parent phone numbers
    const { data: parents } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone")
      .in("user_id", parentIds);

    if (!parents || parents.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No parent profiles found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build SMS message based on type
    let smsMessage = "";
    const schoolName = "World Mission High School";

    switch (type) {
      case "warning":
        smsMessage = `⚠️ ${schoolName} Alert\n\n${studentNameFinal} has received warning #${warning_count || 1} during "${examNameFinal}". ${message || "Please contact your child about exam conduct."}`;
        break;
      
      case "exam_completed":
        smsMessage = `✅ ${schoolName}\n\n${studentNameFinal} has completed "${examNameFinal}"${score !== undefined ? ` with a score of ${score}%` : ""}. View details in the parent portal.`;
        break;
      
      case "exam_started":
        smsMessage = `📝 ${schoolName}\n\n${studentNameFinal} has started "${examNameFinal}". You will receive a notification when they complete it.`;
        break;
      
      case "force_submitted":
        smsMessage = `🚨 ${schoolName} Alert\n\n${studentNameFinal}'s exam "${examNameFinal}" was force-submitted due to exceeding the maximum allowed warnings. Please discuss exam conduct with your child.`;
        break;
      
      default:
        smsMessage = message || `${schoolName}: Notification about ${studentNameFinal}`;
    }

    // Send SMS to all linked parents with phone numbers
    const results: { parent: string; success: boolean; error?: string }[] = [];

    for (const parent of parents) {
      if (parent.phone) {
        const result = await sendTwilioSMS(parent.phone, smsMessage);
        results.push({
          parent: parent.full_name,
          success: result.success,
          error: result.error,
        });

        // Also create an in-app notification
        await supabase.from("notifications").insert({
          user_id: parent.user_id,
          title: type === "warning" ? "Exam Warning Alert" : 
                 type === "exam_completed" ? "Exam Completed" :
                 type === "exam_started" ? "Exam Started" :
                 type === "force_submitted" ? "Exam Force Submitted" : "Notification",
          message: smsMessage.replace(/⚠️|✅|📝|🚨/g, "").trim(),
          type: type === "warning" || type === "force_submitted" ? "warning" : "info",
          link: "/dashboard",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        message: `SMS sent to ${successCount}/${results.length} parents`,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending SMS notification:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
