import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Renders imported question text exactly in its original structure:
 * line breaks, indentation, blanks ("_____"), and pipe tables.
 * Text is rendered as plain React text (no HTML injection).
 */
export const StructuredText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const lines = (text ?? '').split('\n');
  const blocks: Array<{ kind: 'text'; lines: string[] } | { kind: 'table'; rows: string[][] }> = [];
  for (const line of lines) {
    const isRow = /^\s*\|.*\|\s*$/.test(line);
    const last = blocks[blocks.length - 1];
    if (isRow) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // markdown separator row
      const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
      if (last?.kind === 'table') last.rows.push(cells); else blocks.push({ kind: 'table', rows: [cells] });
    } else if (last?.kind === 'text') last.lines.push(line);
    else blocks.push({ kind: 'text', lines: [line] });
  }
  return (
    <div className={cn('space-y-2', className)}>
      {blocks.map((b, i) => b.kind === 'text' ? (
        <p key={i} className="whitespace-pre-wrap break-words">{b.lines.join('\n')}</p>
      ) : (
        <div key={i} className="overflow-x-auto">
          <table className="text-sm border border-border">
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} className={ri === 0 ? 'bg-muted/50 font-medium' : ''}>
                  {r.map((c, ci) => <td key={ci} className="border border-border px-2 py-1 whitespace-pre-wrap">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};
