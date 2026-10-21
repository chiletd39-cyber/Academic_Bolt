// Extracts a question document into STRUCTURED text (not flattened plain text).
// The browser then converts it with the shared parser in src/lib/questionImport.ts.
//  - DOCX: mammoth → HTML → headings, numbered/lettered lists, tables (pipe rows),
//          line breaks, bold-free text; images become [Image] placeholders.
//  - PDF / images: multimodal transcription that keeps numbering, letters,
//          blanks, tables and line breaks verbatim.
//  - TXT / MD / CSV: returned as-is.
// Teachers/admins only.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import mammoth from "https://esm.sh/mammoth@1.7.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const decodeEntities = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const stripTags = (s: string) => decodeEntities(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));

/** Convert mammoth HTML to structured text understood by the client parser. */
function htmlToStructuredText(html: string, warnings: string[]): string {
  let images = 0;
  html = html.replace(/<img[^>]*>/gi, () => { images++; return '[Image]'; });
  if (images) warnings.push(`${images} image(s)/diagram(s) could not be embedded; marked as [Image] in the question text.`);

  // Tables → pipe rows
  html = html.replace(/<table[\s\S]*?<\/table>/gi, (t) => {
    const rows = [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(r =>
      [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => stripTags(c[1]).replace(/\n+/g, ' ').trim()));
    if (!rows.length) return '';
    return '\n' + rows.map(r => `| ${r.join(' | ')} |`).join('\n') + '\n';
  });

  // Ordered lists → numbered / lettered lines (nested lists use letters).
  const renderList = (src: string, depth: number): string =>
    src.replace(/<(ol|ul)[^>]*>([\s\S]*?)<\/\1>/i, (_m, tag: string, inner: string) => {
      let i = 0;
      const items = inner.split(/<li[^>]*>/i).slice(1).map(raw => {
        const body = raw.replace(/<\/li>\s*$/i, '');
        const nested = /<(ol|ul)/i.test(body) ? renderList(body, depth + 1) : body;
        i++;
        const marker = tag.toLowerCase() === 'ul' ? '-' : depth === 0 ? `${i}.` : `${String.fromCharCode(64 + i)}.`;
        return `${'   '.repeat(depth)}${marker} ${stripTags(nested).trim()}`;
      });
      return '\n' + items.join('\n') + '\n';
    });
  let prev = '';
  while (prev !== html && /<(ol|ul)/i.test(html)) { prev = html; html = renderList(html, 0); }

  html = html
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_m, h) => `\n# ${stripTags(h).trim()}\n`)
    .replace(/<\/p>/gi, '\n').replace(/<p[^>]*>/gi, '');
  return stripTags(html).replace(/\n{3,}/g, '\n\n').trim();
}

async function transcribeWithVision(base64: string, mime: string, apiKey: string): Promise<string> {
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3.8-flash',
      temperature: 0,
      messages: [
        { role: 'system', content:
`Transcribe this exam/question document VERBATIM as plain text. Do not summarize, reword, reorder or answer anything.
Rules:
- Keep section headings on their own line (e.g. "SECTION A: ...").
- Keep instructions exactly as written.
- Start every question on a new line with its original number, e.g. "1." or "2a.".
- Put each answer choice on its own line with its original letter, e.g. "A. ...".
- Keep blanks like "________" and marks like "(5 marks)" exactly.
- Keep line breaks inside questions.
- Write tables as pipe rows: "| cell | cell |".
- Keep mathematical notation using Unicode (x², √, π, ≤, ½ …).
- For any image, diagram or graph write "[Diagram: short description]".
- If an answer key is printed, write it as "Answer: X" right after the question.
Return only the transcription.` },
        { role: 'user', content: [
          { type: 'text', text: 'Transcribe the document.' },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
        ] },
      ],
    }),
  });
  if (resp.status === 429) throw new Error('The document reader is busy. Please try again in a minute.');
  if (resp.status === 402) throw new Error('Document reading credits are exhausted. Please contact the administrator.');
  if (!resp.ok) throw new Error(`Document reading failed (${resp.status})`);
  const ai = await resp.json();
  let content: string = ai.choices?.[0]?.message?.content ?? '';
  content = content.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '');
  return content.trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsError } = await client.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401);
    const { data: profile } = await client.from('profiles').select('role').eq('user_id', claims.claims.sub).single();
    if (!profile || !['admin', 'teacher'].includes(profile.role)) return json({ error: 'Forbidden' }, 403);

    const { fileContent, fileName, fileType } = await req.json();
    if (typeof fileContent !== 'string' || !fileContent) return json({ error: 'No file content provided' }, 400);
    if (fileContent.length > 14 * 1024 * 1024) return json({ error: 'File too large. Maximum size is 10MB.' }, 413);

    const lower = String(fileName || '').toLowerCase();
    const warnings: string[] = [];
    let text = '';

    if (/\.(txt|md|csv|tsv)$/.test(lower) || String(fileType || '').startsWith('text/')) {
      text = new TextDecoder().decode(base64ToBytes(fileContent));
    } else if (lower.endsWith('.docx')) {
      const bytes = base64ToBytes(fileContent);
      const res = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
      for (const m of res.messages ?? []) {
        if (m.type === 'warning' && !/unrecognised paragraph style/i.test(m.message)) warnings.push(`Formatting not converted: ${m.message}`);
      }
      text = htmlToStructuredText(res.value, warnings);
      if (/<(math|m:oMath)/i.test(res.value) || /\[Equation\]/.test(text)) warnings.push('Some equations use Word equation objects and may appear as plain text — please check them.');
    } else if (lower.endsWith('.doc')) {
      return json({ error: 'Old .doc files are not supported. Save the file as .docx or PDF and upload again.' }, 415);
    } else if (lower.endsWith('.pdf') || /\.(png|jpe?g|webp)$/.test(lower)) {
      const apiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!apiKey) return json({ error: 'Document reader is not configured' }, 500);
      const mime = lower.endsWith('.pdf') ? 'application/pdf' : (fileType || 'image/png');
      text = await transcribeWithVision(fileContent, mime, apiKey);
      warnings.push('This file was read from a scanned/PDF layout — please review each question before saving.');
    } else {
      return json({ error: 'Unsupported file type. Use .docx, .pdf, .txt, .md, .csv or an image.' }, 415);
    }

    return json({ success: true, text, warnings });
  } catch (e) {
    console.error('parse-question-file error', e);
    return json({ error: e instanceof Error ? e.message : 'Failed to read the document' }, 500);
  }
});
