import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'rw', label: 'Kinyarwanda' },
];

export const LanguageSwitcher = ({ compact = false }: { compact?: boolean }) => {
  const { i18n, t } = useTranslation();
  const current = (i18n.language || 'en').slice(0, 2);
  return (
    <div className="flex items-center gap-2" role="group" aria-label={t('common.language', 'Language')}>
      <Globe className="w-4 h-4 text-muted-foreground hidden sm:block" aria-hidden="true" />
      <Select value={current} onValueChange={(v) => i18n.changeLanguage(v)}>
        <SelectTrigger
          className={compact ? 'h-9 w-[110px]' : 'h-9 w-[140px]'}
          aria-label={t('common.language', 'Language')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LANGS.map((l) => (
            <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
