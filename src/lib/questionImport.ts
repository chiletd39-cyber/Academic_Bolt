/**
 * Structure-preserving question import.
 *
 * Converts a question document (plain text / markdown-like text, or text
 * extracted from DOCX/PDF by the `parse-question-file` backend function)
 * into the system's editable question format WITHOUT flattening it:
 * numbering, section headings, instructions, option letters, blanks,
 * marks, tables (pipe rows), line breaks and math symbols are kept.
 * Anything that cannot be converted is preserved as text and flagged.
 */

export type ImportedQuestionType = 'multiple_choice' | 'short_answer' | 'essay' | 'true_false';

export interface ImportedQuestion {
  id: string;
  /** Question body with original line breaks, blanks, tables and notation. */
  text: string;
  type: ImportedQuestionType;
  options?: string[];
  /** Original option letters (A, B, C…) in the same order as `options`. */
  optionLabels?: string[];
  correctAnswer?: string | number;
  marks: number;
  /** Original number as written in the document ("1", "2a", "IV"). */
  number?: string;
  /** Section heading the question belongs to ("SECTION A: Multiple choice"). */
  section?: string;
  /** Section-level instructions shown before the first question of a section. */
  instructions?: string;
  /** Items that could not be converted; content is kept in `text`. */
  importWarnings?: string[];
}

export interface ImportResult {
  questions: ImportedQuestion[];
  warnings: string[];
  /** Text before the first question that is not part of any section (e.g. paper header). */
  preamble: string;
}

const RE_SECTION = /^\s*(?:#{1,6}\s*)?((?:section|part|unit)\s+[A-Z0-9IVX]+\b.*|[A-Z][A-Z0-9 ,:&'()\-]{3,}:?)\s*$/i;
const RE_QUESTION = /^\s*(?:q(?:uestion)?\s*)?(\d{1,3}[a-z]?|[ivx]{1,5})\s*[.)]\s+(.*)$/i;
const RE_QUESTION_BARE = /^\s*(?:q(?:uestion)?\s*)(\d{1,3}[a-z]?)\s*[:.-]?\s*(.*)$/i;
const RE_OPTION = /^\s*\(?([A-Ha-h])\s*[.)]\s+(.+)$/;
const RE_MARKS = /[([]\s*(\d+(?:\.\d+)?)\s*(?:marks?|mks?|pts?|points?)\s*[)\]]/i;
const RE_ANSWER = /^\s*(?:answer|ans|correct(?:\s+answer)?|key)\s*[:=-]\s*(.+)$/i;
const RE_INSTRUCTION = /^\s*(?:instructions?|note|directions?|read\s+carefully)\b[:\s-]*/i;
const RE_IMAGE = /\[(?:image|figure|diagram|picture)[^\]]*\]/i;
const RE_ESSAY = /\b(explain|describe|discuss|justify|show your work|show all (?:your )?work|compare|evaluate|why|how)\b/i;

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `q-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** True for the legacy CSV template: text,type,marks,optA..optD,correct */
function isLegacyCsv(lines: string[]): boolean {
  const header = (lines[0] ?? '').toLowerCase();
  return /^"?(question|text)"?\s*,/.test(header) && header.includes('type');
}

function parseLegacyCsv(lines: string[]): ImportResult {
  const questions: ImportedQuestion[] = [];
  const warnings: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsv(lines[i]);
    if (parts.length < 3) { if (lines[i].trim()) warnings.push(`Row ${i + 1} skipped: not enough columns`); continue; }
    const t = (parts[1] || 'short_answer') as ImportedQuestionType;
    const type: ImportedQuestionType = ['multiple_choice', 'short_answer', 'essay', 'true_false'].includes(t) ? t : 'short_answer';
    const opts = type === 'multiple_choice' ? parts.slice(3, 7).map(s => s ?? '') : undefined;
    questions.push({
      id: uid(), text: parts[0].replace(/\\n/g, '\n'), type, marks: Number(parts[2]) || 1,
      options: opts, optionLabels: opts?.map((_, k) => String.fromCharCode(65 + k)),
      correctAnswer: type === 'multiple_choice' ? (Number(parts[7]) || 0) : parts[3],
      number: String(questions.length + 1),
    });
  }
  return { questions, warnings, preamble: '' };
}

function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function resolveAnswer(raw: string, q: ImportedQuestion): string | number {
  const v = raw.trim().replace(/[.)]$/, '');
  if (q.type === 'true_false') return /^(t|true|vrai|yes)$/i.test(v) ? 0 : 1;
  if (q.type === 'multiple_choice' && q.optionLabels) {
    const idx = q.optionLabels.findIndex(l => l.toLowerCase() === v.charAt(0).toLowerCase() && (v.length === 1 || /^[a-h][\s.)]/i.test(v)));
    if (idx >= 0) return idx;
    const byText = (q.options ?? []).findIndex(o => o.trim().toLowerCase() === v.toLowerCase());
    if (byText >= 0) return byText;
  }
  return raw.trim();
}

function finalize(q: ImportedQuestion, body: string[], answer: string | null): ImportedQuestion {
  // Trim trailing blank lines but keep internal spacing.
  while (body.length && !body[body.length - 1].trim()) body.pop();
  let text = body.join('\n');
  const marks = text.match(RE_MARKS);
  if (marks) { q.marks = Number(marks[1]) || q.marks; text = text.replace(RE_MARKS, '').replace(/[ \t]+$/gm, ''); }
  q.text = text;

  const warn: string[] = [];
  if (RE_IMAGE.test(text)) warn.push('Contains an image/diagram that could not be embedded — the placeholder text was kept; attach the image manually if needed.');

  const opts = q.options ?? [];
  if (opts.length >= 2) {
    const tf = opts.length === 2 && /^(true|vrai)$/i.test(opts[0].trim()) && /^(false|faux)$/i.test(opts[1].trim());
    q.type = tf ? 'true_false' : 'multiple_choice';
    if (tf) { q.options = undefined; q.optionLabels = undefined; }
  } else if (opts.length === 1) {
    warn.push('Only one answer choice was found — kept as text.');
    q.text = `${q.text}\n${q.optionLabels?.[0] ?? 'A'}. ${opts[0]}`;
    q.options = undefined; q.optionLabels = undefined;
    q.type = 'short_answer';
  } else {
    q.type = RE_ESSAY.test(text) || q.marks >= 5 || text.split('\n').length > 3 ? 'essay' : 'short_answer';
  }
  if (answer) q.correctAnswer = resolveAnswer(answer, q);
  else if (q.type === 'multiple_choice') warn.push('No correct answer found — choose it before saving.');
  if (!q.text.trim()) warn.push('Question text is empty.');
  if (warn.length) q.importWarnings = warn;
  return q;
}

export function parseQuestionDocument(input: string): ImportResult {
  const normalized = input.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  const allLines = normalized.split('\n');
  const nonEmpty = allLines.filter(l => l.trim());
  if (nonEmpty.length === 0) return { questions: [], warnings: ['The file is empty.'], preamble: '' };
  if (isLegacyCsv(nonEmpty)) return parseLegacyCsv(nonEmpty);

  const questions: ImportedQuestion[] = [];
  const warnings: string[] = [];
  const preamble: string[] = [];
  let section: string | undefined;
  let sectionInstr: string[] = [];
  let pendingInstr: string | undefined;
  let cur: ImportedQuestion | null = null;
  let body: string[] = [];
  let answer: string | null = null;
  let inOptions = false;

  const flush = () => {
    if (cur) questions.push(finalize(cur, body, answer));
    cur = null; body = []; answer = null; inOptions = false;
  };

  for (const line of allLines) {
    const trimmed = line.trim();

    // Section heading
    if (trimmed && RE_SECTION.test(trimmed) && !RE_QUESTION.test(trimmed) && !RE_OPTION.test(trimmed) && trimmed.length <= 90
        && (/^(#|section|part|unit)/i.test(trimmed) || trimmed === trimmed.toUpperCase())) {
      flush();
      section = trimmed.replace(/^#+\s*/, '');
      sectionInstr = []; pendingInstr = undefined;
      continue;
    }

    const qm = line.match(RE_QUESTION) ?? (/^\s*q(?:uestion)?\s*\d/i.test(line) ? line.match(RE_QUESTION_BARE) : null);
    // Single letters like "a." inside a question are options/sub-parts, not new questions.
    if (qm && !(cur && /^[ivx]+$/i.test(qm[1]) && inOptions)) {
      flush();
      if (sectionInstr.length) { pendingInstr = sectionInstr.join('\n').trim(); sectionInstr = []; }
      cur = { id: uid(), text: '', type: 'short_answer', marks: 1, number: qm[1], section, instructions: pendingInstr };
      pendingInstr = undefined;
      body = [qm[2]];
      continue;
    }

    if (!cur) {
      if (!trimmed) { if (section) sectionInstr.push(''); else preamble.push(''); continue; }
      if (section || RE_INSTRUCTION.test(trimmed)) sectionInstr.push(line.replace(/\s+$/, ''));
      else preamble.push(line.replace(/\s+$/, ''));
      continue;
    }

    const am = line.match(RE_ANSWER);
    if (am) { answer = am[1]; continue; }

    const om = line.match(RE_OPTION);
    if (om) {
      cur.options = cur.options ?? []; cur.optionLabels = cur.optionLabels ?? [];
      cur.options.push(om[2].trim()); cur.optionLabels.push(om[1].toUpperCase());
      inOptions = true;
      continue;
    }

    if (inOptions && trimmed && cur.options?.length) {
      // Wrapped continuation of the last option.
      cur.options[cur.options.length - 1] += `\n${trimmed}`;
      continue;
    }
    body.push(line.replace(/\s+$/, ''));
  }
  flush();

  if (questions.length === 0) warnings.push('No numbered questions were detected. Number each question like "1." or "Q1" and put choices on their own lines as "A." "B." …');
  const flagged = questions.filter(q => q.importWarnings?.length).length;
  if (flagged) warnings.push(`${flagged} question(s) need review — see the flags on each question.`);
  return { questions, warnings, preamble: preamble.join('\n').trim() };
}
