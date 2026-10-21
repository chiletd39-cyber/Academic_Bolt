import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Key, ArrowLeft, ArrowRight, ShieldAlert, Lock, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PasswordInput } from './PasswordInput';
import { useOfflineDraft, loadOfflineDraft, clearOfflineDraft } from '@/hooks/useNetworkStatus';

interface AdminLoginProps {
  onBack: () => void;
  onComplete: (data: { email: string; code: string; password?: string }) => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onBack, onComplete }) => {
  const draft = loadOfflineDraft<{ email: string }>('admin-login') || { email: '' };
  const [email, setEmail] = useState(draft.email);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  // Persist non-sensitive draft (email only) for 2-minute offline recovery
  useOfflineDraft('admin-login', { email });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && password.trim() && code.trim()) {
      clearOfflineDraft('admin-login');
      onComplete({ email, code, password });
    }
  };

  const isValid = email.trim() && password.trim() && code.trim();


  return (
    <div className="space-y-6 animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back to role selection</span>
      </button>

      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground">Admin Login</h2>
        <p className="text-muted-foreground mt-2">Secure access for authorized personnel only</p>
      </div>

      <Alert className="border-warning/50 bg-warning/10">
        <ShieldAlert className="h-4 w-4 text-warning" />
        <AlertDescription className="text-sm text-foreground">
          Admin access is restricted. Contact a main admin for your security code.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="admin-email">Admin Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              id="admin-email"
              type="email"
              placeholder="Enter admin email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-11 h-12"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-password">Password</Label>
          <PasswordInput
            id="admin-password"
            placeholder="Enter your admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12"
            leftIcon={<Lock className="w-5 h-5" />}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-code">Security Code</Label>
          <PasswordInput
            id="admin-code"
            placeholder="Enter security code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="h-12"
            leftIcon={<Key className="w-5 h-5" />}
          />
          <div className="flex items-start gap-1.5 mt-1.5">
            <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Hint:</span> Sub-Admin code format: <span className="font-mono text-foreground/70">1k****2025</span> · Main Admin code format: <span className="font-mono text-foreground/70">k****2026</span>
            </p>
          </div>
        </div>

        <Button type="submit" disabled={!isValid} className="w-full h-12">
          Access Admin Panel
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </form>
    </div>
  );
};
