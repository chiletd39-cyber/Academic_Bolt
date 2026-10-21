import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';

/**
 * Prompts the user to rotate to landscape on narrow portrait tablets during exams.
 * Rendered only when width < 900 AND portrait orientation.
 */
export const OrientationGate = ({ children }: { children: React.ReactNode }) => {
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const update = () => {
      const isPortrait = window.matchMedia('(orientation: portrait)').matches;
      const narrow = window.innerWidth < 900 && window.innerWidth >= 480;
      setPortrait(isPortrait && narrow);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (portrait) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-8 text-center">
        <Smartphone className="w-16 h-16 text-primary mb-4 rotate-90" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Please rotate your device</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Exams and monitored sessions require landscape orientation for the best experience.
        </p>
      </div>
    );
  }
  return <>{children}</>;
};
