import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props { error?: Error | null; onReset?: () => void; }

export const RouteError = ({ error, onReset }: Props) => {
  const navigate = useNavigate();
  return (
    <div role="alert" className="flex flex-col items-center justify-center min-h-[50dvh] p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-destructive" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        {error?.message || 'An unexpected error occurred while rendering this page. Please try again or return home.'}
      </p>
      <div className="flex gap-3">
        <Button onClick={() => { onReset?.(); window.location.reload(); }} aria-label="Reload page">
          <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" /> Reload
        </Button>
        <Button variant="outline" onClick={() => navigate('/')} aria-label="Go to home">
          <Home className="w-4 h-4 mr-2" aria-hidden="true" /> Home
        </Button>
      </div>
    </div>
  );
};
