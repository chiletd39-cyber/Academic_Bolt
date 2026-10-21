import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import { subDays, subMonths, subYears } from 'date-fns';

export type DateRange = 'all' | '2weeks' | 'month' | '3months' | '6months' | '1year' | '2years' | '3years';

interface DateGroupFilterProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
  className?: string;
}

export const dateRangeOptions: { value: DateRange; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: '2weeks', label: 'Last 2 Weeks' },
  { value: 'month', label: 'Last Month' },
  { value: '3months', label: 'Last 3 Months' },
  { value: '6months', label: 'Last 6 Months' },
  { value: '1year', label: 'Last Year' },
  { value: '2years', label: 'Last 2 Years' },
  { value: '3years', label: 'Last 3 Years' },
];

export function getDateRangeStart(range: DateRange): Date | null {
  const now = new Date();
  switch (range) {
    case '2weeks': return subDays(now, 14);
    case 'month': return subMonths(now, 1);
    case '3months': return subMonths(now, 3);
    case '6months': return subMonths(now, 6);
    case '1year': return subYears(now, 1);
    case '2years': return subYears(now, 2);
    case '3years': return subYears(now, 3);
    default: return null;
  }
}

export function filterByDateRange<T extends { created_at?: string; [key: string]: any }>(
  items: T[],
  range: DateRange,
  dateField: string = 'created_at'
): T[] {
  const start = getDateRangeStart(range);
  if (!start) return items;
  return items.filter(item => {
    const d = item[dateField];
    return d && new Date(d) >= start;
  });
}

export const DateGroupFilter = ({ value, onChange, className }: DateGroupFilterProps) => {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DateRange)}>
      <SelectTrigger className={className || 'w-44'}>
        <Calendar className="w-4 h-4 mr-2" />
        <SelectValue placeholder="Time range" />
      </SelectTrigger>
      <SelectContent>
        {dateRangeOptions.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
