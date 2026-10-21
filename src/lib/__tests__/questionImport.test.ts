import { describe, it, expect } from 'vitest';
import { parseQuestionDocument } from '../questionImport';

const DOC = `WMHS END OF TERM EXAM — MATHEMATICS L4

SECTION A: MULTIPLE CHOICE
Instructions: Choose the correct answer. Each question carries 2 marks.

1. What is the value of x if 2x + 3 = 11? (2 marks)
A. 2
B. 4
C. 7
D. 8
Answer: B

2. The capital of Rwanda is ________.
a) Huye
b) Kigali
c) Musanze
Answer: b

SECTION B: STRUCTURED QUESTIONS
Show your work for full marks.

3. Complete the table for y = x² (4 marks)
| x | 1 | 2 | 3 |
|---|---|---|---|
| y | 1 | ___ | ___ |

4. Explain why √2 is irrational. (6 marks)
   Use proof by contradiction.
[Diagram: number line]

5. True or false: 0 is an even number.
A. True
B. False
Answer: True`;

describe('parseQuestionDocument', () => {
  const r = parseQuestionDocument(DOC);

  it('finds every numbered question with its original number', () => {
    expect(r.questions.map(q => q.number)).toEqual(['1', '2', '3', '4', '5']);
    expect(r.preamble).toContain('WMHS END OF TERM EXAM');
  });

  it('keeps sections and instructions', () => {
    expect(r.questions[0].section).toBe('SECTION A: MULTIPLE CHOICE');
    expect(r.questions[0].instructions).toContain('Choose the correct answer');
    expect(r.questions[2].section).toBe('SECTION B: STRUCTURED QUESTIONS');
    expect(r.questions[2].instructions).toContain('Show your work');
  });

  it('keeps option letters, choices, answers and marks', () => {
    const q1 = r.questions[0];
    expect(q1.type).toBe('multiple_choice');
    expect(q1.optionLabels).toEqual(['A', 'B', 'C', 'D']);
    expect(q1.options).toEqual(['2', '4', '7', '8']);
    expect(q1.correctAnswer).toBe(1);
    expect(q1.marks).toBe(2);
    expect(r.questions[1].correctAnswer).toBe(1);
  });

  it('preserves blanks, tables, notation and line breaks', () => {
    expect(r.questions[1].text).toContain('________');
    expect(r.questions[2].text).toContain('| y | 1 | ___ | ___ |');
    expect(r.questions[2].text).toContain('x²');
    expect(r.questions[3].text).toContain('√2');
    expect(r.questions[3].text).toContain('\n   Use proof by contradiction.');
    expect(r.questions[3].type).toBe('essay');
    expect(r.questions[3].marks).toBe(6);
  });

  it('flags unsupported content instead of dropping it', () => {
    expect(r.questions[3].text).toContain('[Diagram: number line]');
    expect(r.questions[3].importWarnings?.[0]).toMatch(/image\/diagram/);
  });

  it('detects true/false', () => {
    expect(r.questions[4].type).toBe('true_false');
    expect(r.questions[4].correctAnswer).toBe(0);
  });

  it('still accepts the legacy CSV template', () => {
    const csv = 'question,type,marks,a,b,c,d,correct\n"What is 2+2?",multiple_choice,1,3,4,5,6,1';
    const c = parseQuestionDocument(csv);
    expect(c.questions[0].options).toEqual(['3', '4', '5', '6']);
    expect(c.questions[0].correctAnswer).toBe(1);
  });
});
