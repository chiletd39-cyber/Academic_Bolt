import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ActiveClassContextType {
  activeClass: string;
  setActiveClass: (className: string) => void;
  classes: string[];
  isLoadingClasses: boolean;
  refreshClasses: () => Promise<string[]>;
}

const ActiveClassContext = createContext<ActiveClassContextType | undefined>(undefined);

export const ActiveClassProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role, profile } = useAuth();
  const [activeClass, setActiveClassState] = useState<string>('');
  const [classes, setClasses] = useState<string[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);

  const fetchClasses = useCallback(async () => {
    setIsLoadingClasses(true);
    const { data } = await supabase
      .from('classes')
      .select('name')
      .order('name');
    
    const classNames = (data || []).map(c => c.name);
    setClasses(classNames);
    setIsLoadingClasses(false);
    return classNames;
  }, []);

  // Initialize: fetch classes and set default
  useEffect(() => {
    const init = async () => {
      const classNames = await fetchClasses();
      
      // For students, use their current_class
      if (role === 'student' && profile?.current_class) {
        setActiveClassState(profile.current_class);
        return;
      }

      // For teacher/admin, restore from localStorage or pick first
      const stored = localStorage.getItem(`activeClass_${role}`);
      if (stored && classNames.includes(stored)) {
        setActiveClassState(stored);
      } else if (classNames.length > 0) {
        setActiveClassState(classNames[0]);
      }
    };
    
    if (role) init();
  }, [role, profile?.current_class, fetchClasses]);

  const setActiveClass = useCallback((className: string) => {
    setActiveClassState(className);
    if (role) {
      localStorage.setItem(`activeClass_${role}`, className);
    }
  }, [role]);

  const value = useMemo(() => ({
    activeClass,
    setActiveClass,
    classes,
    isLoadingClasses,
    refreshClasses: fetchClasses,
  }), [activeClass, setActiveClass, classes, isLoadingClasses, fetchClasses]);

  return (
    <ActiveClassContext.Provider value={value}>
      {children}
    </ActiveClassContext.Provider>
  );
};

export const useActiveClass = () => {
  const context = useContext(ActiveClassContext);
  if (context === undefined) {
    throw new Error('useActiveClass must be used within an ActiveClassProvider');
  }
  return context;
};
