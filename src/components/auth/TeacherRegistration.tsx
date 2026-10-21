import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, ArrowLeft, ArrowRight, User, Phone, Lock } from 'lucide-react';
import { PasswordInput } from './PasswordInput';

interface TeacherRegistrationProps {
  onBack: () => void;
  onComplete: (data: { 
    email: string; 
    password?: string;
    name: string; 
    phone: string;
  }) => void;
}

export const TeacherRegistration: React.FC<TeacherRegistrationProps> = ({ onBack, onComplete }) => {
  const [step, setStep] = useState<'email' | 'details'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isLogin, setIsLogin] = useState(true); // Default to sign-in

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && password.trim()) {
      if (isLogin) {
        onComplete({ email, password, name: 'Teacher', phone: '' });
      } else {
        setStep('details');
      }
    }
  };

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && phone.trim()) {
      onComplete({ email, password, name, phone });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        onClick={step === 'email' ? onBack : () => setStep('email')}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">{step === 'email' ? 'Back to role selection' : 'Back'}</span>
      </button>

      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground">Teacher {isLogin ? 'Login' : 'Registration'}</h2>
        <p className="text-muted-foreground mt-2">
          {step === 'email' ? 'Enter your email to continue' : 'Complete your profile'}
        </p>
      </div>

      {step === 'email' && (
        <form onSubmit={handleEmailContinue} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-11 h-12"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12"
              leftIcon={<Lock className="w-5 h-5" />}
              required
              minLength={6}
            />
          </div>

          <Button type="submit" className="w-full h-12" disabled={!email.trim() || !password.trim()}>
            {isLogin ? 'Login' : 'Continue'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline"
            >
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </form>
      )}

      {step === 'details' && (
        <form onSubmit={handleDetailsSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="name"
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-11 h-12"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="phone"
                type="tel"
                placeholder="Enter your phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pl-11 h-12"
                required
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12"
            disabled={!name.trim() || !phone.trim()}
          >
            Complete Registration
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </form>
      )}
    </div>
  );
};
