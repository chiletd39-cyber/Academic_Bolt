import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, ArrowLeft, ArrowRight, User, CreditCard, BookOpen, Phone, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PasswordInput } from './PasswordInput';

interface StudentRegistrationProps {
  onBack: () => void;
  onComplete: (data: {
    email: string; 
    password?: string;
    name: string; 
    studentCard: string; 
    className: string; 
    phone: string;
  }) => void;
}

export const StudentRegistration: React.FC<StudentRegistrationProps> = ({ onBack, onComplete }) => {
  const [step, setStep] = useState<'email' | 'details'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [studentCard, setStudentCard] = useState('');
  const [className, setClassName] = useState('');
  const [phone, setPhone] = useState('');
  const [isLogin, setIsLogin] = useState(true); // Default to sign-in
  const [cardValidation, setCardValidation] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'already_used' | 'name_mismatch'>('idle');
  const [registeredStudentInfo, setRegisteredStudentInfo] = useState<{ full_name: string; class_name: string | null } | null>(null);
  const [availableClasses, setAvailableClasses] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchClasses = async () => {
      const { data } = await supabase.from('classes').select('id, name').order('name');
      if (data) setAvailableClasses(data);
    };
    fetchClasses();
  }, []);

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && password.trim()) {
      if (isLogin) {
        onComplete({ email, password, name: 'Student', studentCard: '', className: '', phone: '' });
      } else {
        setStep('details');
      }
    }
  };

  const validateStudentCard = async (card: string) => {
    if (!card.trim()) {
      setCardValidation('idle');
      return;
    }

    setCardValidation('checking');
    
    const { data: regInfo, error } = await supabase.rpc('get_student_registration_info', { card_number: card.trim() });

    if (error || !regInfo || regInfo.length === 0) {
      const { data: exists } = await supabase.rpc('check_student_card_exists', { card_number: card.trim() });
      if (exists) {
        setCardValidation('already_used');
      } else {
        setCardValidation('invalid');
      }
      setRegisteredStudentInfo(null);
      return;
    }

    const registeredStudent = regInfo[0];
    setCardValidation('valid');
    setRegisteredStudentInfo({
      full_name: registeredStudent.full_name,
      class_name: registeredStudent.class_name,
    });
    
    if (registeredStudent.full_name) setName(registeredStudent.full_name);
    if (registeredStudent.class_name) setClassName(registeredStudent.class_name);
  };

  const handleStudentCardChange = (value: string) => {
    setStudentCard(value);
    const timer = setTimeout(() => {
      validateStudentCard(value);
    }, 500);
    return () => clearTimeout(timer);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (registeredStudentInfo && cardValidation === 'valid') {
      const registeredName = registeredStudentInfo.full_name.toLowerCase().trim();
      const enteredName = value.toLowerCase().trim();
      if (enteredName && !registeredName.includes(enteredName) && !enteredName.includes(registeredName)) {
        if (Math.abs(registeredName.length - enteredName.length) > 3) {
          setCardValidation('name_mismatch');
        }
      } else {
        setCardValidation('valid');
      }
    }
  };

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (cardValidation !== 'valid') return;
    
    if (name.trim() && studentCard.trim() && className.trim() && phone.trim()) {
      onComplete({ email, password, name, studentCard, className, phone });
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
        <h2 className="text-2xl font-bold text-foreground">Student {isLogin ? 'Login' : 'Registration'}</h2>
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
            <Label htmlFor="studentCard">Student Card Number *</Label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="studentCard"
                type="text"
                placeholder="Enter your student card number"
                value={studentCard}
                onChange={(e) => handleStudentCardChange(e.target.value)}
                className={`pl-11 h-12 ${
                  cardValidation === 'valid' ? 'border-success' : 
                  cardValidation === 'invalid' || cardValidation === 'already_used' || cardValidation === 'name_mismatch' ? 'border-destructive' : ''
                }`}
                required
              />
              {cardValidation === 'checking' && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                </div>
              )}
              {cardValidation === 'valid' && (
                <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-success" />
              )}
              {(cardValidation === 'invalid' || cardValidation === 'already_used' || cardValidation === 'name_mismatch') && (
                <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-destructive" />
              )}
            </div>
            
            {cardValidation === 'invalid' && (
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This student card is not registered in the system. Please contact your admin.
                </AlertDescription>
              </Alert>
            )}
            
            {cardValidation === 'already_used' && (
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  An account already exists with this student card. Please login instead.
                </AlertDescription>
              </Alert>
            )}

            {cardValidation === 'name_mismatch' && (
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  The name you entered does not match the registered name for this student card. Expected: {registeredStudentInfo?.full_name}
                </AlertDescription>
              </Alert>
            )}
            
            {cardValidation === 'valid' && registeredStudentInfo && (
              <Alert className="mt-2 border-success bg-success/10">
                <CheckCircle className="h-4 w-4 text-success" />
                <AlertDescription className="text-success">
                  Verified: {registeredStudentInfo.full_name} {registeredStudentInfo.class_name && `(${registeredStudentInfo.class_name})`}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="name"
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="pl-11 h-12"
                required
                disabled={cardValidation === 'valid' && registeredStudentInfo?.full_name ? true : false}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="className">Class *</Label>
            {cardValidation === 'valid' && registeredStudentInfo?.class_name ? (
              <div className="relative">
                <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="className"
                  type="text"
                  value={className}
                  className="pl-11 h-12"
                  disabled
                />
              </div>
            ) : (
              <Select value={className} onValueChange={setClassName}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select your class" />
                </SelectTrigger>
                <SelectContent>
                  {availableClasses.map((cls) => (
                    <SelectItem key={cls.id} value={cls.name}>{cls.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
            disabled={cardValidation !== 'valid' || !name.trim() || !studentCard.trim() || !className.trim() || !phone.trim()}
          >
            Complete Registration
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </form>
      )}
    </div>
  );
};
