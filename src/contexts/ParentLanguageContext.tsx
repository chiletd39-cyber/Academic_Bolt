import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export type ParentLang = 'en' | 'fr';

const STORAGE_KEY = 'parent.dashboard.lang';

const DICT: Record<ParentLang, Record<string, string>> = {
  en: {
    'parent.portal': 'Parent Portal',
    'parent.subtitle': "Monitor your child's academic progress",
    'parent.level': 'Level',
    'parent.selectChild': 'Select child',
    'parent.avgPerf': 'Avg. Performance',
    'parent.tab.portal': 'Portal',
    'parent.tab.announcement': 'Announcement',
    'parent.tab.history': 'History',
    'parent.tab.messages': 'Messages',
    'parent.activity.title': 'Last 1 Hour Activity',
    'parent.activity.sub': 'Recent actions from your child',
    'parent.activity.empty': 'No activity in the last hour',
    'parent.perf.title': 'Performance Analysis',
    'parent.perf.sub': 'Score trend over recent assessments',
    'parent.perf.empty': 'No performance data available yet',
    'parent.ann.title': 'Announcements',
    'parent.ann.sub': 'Messages from admin and teachers',
    'parent.ann.empty': 'No announcements yet',
    'parent.history.title': 'Child History',
    'parent.history.sub': 'Past submissions and exam results',
    'parent.history.empty': 'No history available for Level',
    'parent.awaiting.title': 'Awaiting Admin Approval',
    'parent.awaiting.body': 'Your parent-child link request has been submitted and is pending administrator approval. This page will automatically update once approved.',
    'parent.pending': 'pending request',
    'parent.listening': 'Listening for updates...',
    'parent.noChildren': 'No Children Linked',
    'parent.noChildren.body': 'Search for your child and send a link request. An admin will approve it.',
    'parent.link.button': 'Send Request to Link Child',
    'parent.link.find': 'Find Your Child',
    'parent.link.byName': 'By Name',
    'parent.link.byCard': 'By Student Card',
    'parent.link.placeholderName': "Child's name...",
    'parent.link.placeholderCard': 'Student card...',
    'parent.link.search': 'Search',
    'parent.link.send': 'Send Request for',
    'parent.link.sending': 'Sending...',
    'parent.link.note': 'Admin will review and approve your request. Dashboard updates automatically.',
    'parent.lang': 'Language',
  },
  fr: {
    'parent.portal': 'Portail Parent',
    'parent.subtitle': 'Suivez les progrès académiques de votre enfant',
    'parent.level': 'Niveau',
    'parent.selectChild': 'Sélectionner un enfant',
    'parent.avgPerf': 'Performance moyenne',
    'parent.tab.portal': 'Portail',
    'parent.tab.announcement': 'Annonces',
    'parent.tab.history': 'Historique',
    'parent.tab.messages': 'Messages',
    'parent.activity.title': "Activité de la dernière heure",
    'parent.activity.sub': 'Actions récentes de votre enfant',
    'parent.activity.empty': "Aucune activité dans la dernière heure",
    'parent.perf.title': 'Analyse de performance',
    'parent.perf.sub': 'Évolution des scores aux évaluations récentes',
    'parent.perf.empty': 'Aucune donnée de performance disponible',
    'parent.ann.title': 'Annonces',
    'parent.ann.sub': "Messages de l'administration et des enseignants",
    'parent.ann.empty': "Aucune annonce pour l'instant",
    'parent.history.title': "Historique de l'enfant",
    'parent.history.sub': "Résultats et soumissions passés",
    'parent.history.empty': 'Aucun historique disponible pour le Niveau',
    'parent.awaiting.title': "En attente de l'approbation de l'administrateur",
    'parent.awaiting.body': "Votre demande de liaison parent-enfant a été soumise et est en attente d'approbation. Cette page sera mise à jour automatiquement une fois approuvée.",
    'parent.pending': 'demande en attente',
    'parent.listening': 'En écoute des mises à jour...',
    'parent.noChildren': 'Aucun enfant lié',
    'parent.noChildren.body': "Recherchez votre enfant et envoyez une demande de liaison. Un administrateur l'approuvera.",
    'parent.link.button': 'Envoyer une demande pour lier un enfant',
    'parent.link.find': 'Trouvez votre enfant',
    'parent.link.byName': 'Par nom',
    'parent.link.byCard': 'Par carte étudiant',
    'parent.link.placeholderName': "Nom de l'enfant...",
    'parent.link.placeholderCard': 'Carte étudiant...',
    'parent.link.search': 'Rechercher',
    'parent.link.send': 'Envoyer la demande pour',
    'parent.link.sending': 'Envoi...',
    'parent.link.note': "L'administrateur examinera et approuvera votre demande. Le tableau de bord se mettra à jour automatiquement.",
    'parent.lang': 'Langue',
  },
};

interface Ctx {
  lang: ParentLang;
  setLang: (l: ParentLang) => void;
  t: (key: string) => string;
}

const ParentLanguageContext = createContext<Ctx | null>(null);

export const ParentLanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<ParentLang>(() => {
    if (typeof window === 'undefined') return 'en';
    return (localStorage.getItem(STORAGE_KEY) as ParentLang) || 'en';
  });

  const setLang = useCallback((l: ParentLang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  const t = useCallback((key: string) => DICT[lang][key] ?? DICT.en[key] ?? key, [lang]);

  useEffect(() => {
    document.documentElement.setAttribute('data-parent-lang', lang);
  }, [lang]);

  return (
    <ParentLanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </ParentLanguageContext.Provider>
  );
};

export const useParentLang = () => {
  const ctx = useContext(ParentLanguageContext);
  if (!ctx) {
    // Safe fallback when used outside the provider (returns identity translator)
    return { lang: 'en' as ParentLang, setLang: () => {}, t: (k: string) => DICT.en[k] ?? k };
  }
  return ctx;
};
