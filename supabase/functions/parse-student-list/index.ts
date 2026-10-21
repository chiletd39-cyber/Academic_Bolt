import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import mammoth from "https://esm.sh/mammoth@1.7.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ParsedStudent {
  student_card: string;
  full_name: string;
  class_name?: string;
}

// Decode base64 to Uint8Array (chunked to avoid stack overflow)
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Parse plain text (CSV/TSV/TXT) into student rows
function parseTextRows(text: string): ParsedStudent[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect delimiter from first non-empty line
  const sample = lines[0];
  const delim = sample.includes('\t') ? '\t' : sample.includes(';') ? ';' : ',';

  const rows = lines.map(l =>
    l.split(delim).map(p => p.trim().replace(/^"|"$/g, ''))
  );

  // Detect header
  const firstRow = rows[0].map(c => c.toLowerCase());
  const hasHeader = firstRow.some(c =>
    /name|card|id|student|class|grade|level/.test(c)
  );

  let cardIdx = 0, nameIdx = 1, classIdx = 2;
  if (hasHeader) {
    firstRow.forEach((c, i) => {
      if (/card|^id$|student.?id|matric|number/.test(c)) cardIdx = i;
      else if (/name|full.?name/.test(c)) nameIdx = i;
      else if (/class|grade|level/.test(c)) classIdx = i;
    });
  }

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const students: ParsedStudent[] = [];

  dataRows.forEach((cols, idx) => {
    if (cols.length < 2) return;
    const card = (cols[cardIdx] || `STU${String(idx + 1).padStart(3, '0')}`).trim();
    const name = (cols[nameIdx] || '').trim();
    const cls = (cols[classIdx] || '').trim();
    if (!name || /^[\d\s\-]+$/.test(name)) return; // skip rows with no real name
    students.push({
      student_card: card,
      full_name: name,
      class_name: cls || undefined,
    });
  });

  return students;
}

// Use multimodal LLM only for true binary docs (PDF / images)
async function parseWithVision(base64: string, mime: string, apiKey: string): Promise<ParsedStudent[]> {
  const dataUrl = `data:${mime};base64,${base64}`;
  const systemPrompt = `Extract every student row from the document. Return ONLY a JSON array; each item must have student_card (string), full_name (string), and optional class_name. If no explicit ID, generate STU001, STU002, etc. Skip headers, totals, page numbers. Return [] if no students.`;

  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all students as JSON array.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0,
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('AI Gateway error:', resp.status, errorText);
    throw new Error(`AI parse failed (${resp.status})`);
  }

  const ai = await resp.json();
  let content: string = ai.choices?.[0]?.message?.content || '[]';
  if (content.includes('```json')) content = content.split('```json')[1].split('```')[0];
  else if (content.includes('```')) content = content.split('```')[1].split('```')[0];

  try {
    const arr = JSON.parse(content.trim());
    if (!Array.isArray(arr)) return [];
    return arr.filter((s: any) => s && s.full_name && s.student_card)
      .map((s: any) => ({
        student_card: String(s.student_card),
        full_name: String(s.full_name),
        class_name: s.class_name ? String(s.class_name) : undefined,
      }));
  } catch (e) {
    console.error('JSON parse failed:', e);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    const { data: callerProfile } = await anonClient
      .from('profiles').select('role').eq('user_id', claimsData.claims.sub).single();
    if (!callerProfile || !['admin', 'teacher'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { fileContent, fileName, fileType } = await req.json();
    if (!fileContent) {
      return new Response(JSON.stringify({ error: 'No file content provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (fileContent.length > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: 'File too large. Maximum size is 10MB.' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const lower = (fileName || '').toLowerCase();
    const isCSV = lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt') || fileType?.includes('csv') || fileType?.startsWith('text/');
    const isXLSX = lower.endsWith('.xlsx') || lower.endsWith('.xls') || fileType?.includes('spreadsheet') || fileType?.includes('excel');
    const isDOCX = lower.endsWith('.docx') || fileType?.includes('officedocument.wordprocessingml');
    const isPDF = lower.endsWith('.pdf') || fileType?.includes('pdf');
    const isImage = fileType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(lower);

    let students: ParsedStudent[] = [];

    try {
      if (isCSV) {
        const text = new TextDecoder().decode(base64ToBytes(fileContent));
        students = parseTextRows(text);
      } else if (isXLSX) {
        const bytes = base64ToBytes(fileContent);
        const wb = XLSX.read(bytes, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        students = parseTextRows(csv);
      } else if (isDOCX) {
        const bytes = base64ToBytes(fileContent);
        const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer });
        students = parseTextRows(result.value);
      } else if (isPDF || isImage) {
        const apiKey = Deno.env.get('LOVABLE_API_KEY');
        if (!apiKey) throw new Error('AI parser not configured');
        const mime = isPDF ? 'application/pdf' : (fileType || 'image/png');
        students = await parseWithVision(fileContent, mime, apiKey);
      } else {
        // Fallback: try as plain text
        const text = new TextDecoder().decode(base64ToBytes(fileContent));
        students = parseTextRows(text);
      }
    } catch (parseErr) {
      console.error('Parsing error:', parseErr);
      return new Response(JSON.stringify({
        error: 'Failed to parse file',
        details: parseErr instanceof Error ? parseErr.message : String(parseErr),
      }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Dedupe by student_card
    const seen = new Set<string>();
    students = students.filter(s => {
      const key = s.student_card.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return new Response(JSON.stringify({
      success: true,
      students,
      count: students.length,
      message: students.length > 0
        ? `Successfully extracted ${students.length} students`
        : 'No students found in document. Please check the file format.',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Parse error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to process document',
      details: error instanceof Error ? error.message : String(error),
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
