import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Users, Mail, Phone, Lock, User, CreditCard, Search, GraduationCap, Check } from 'lucide-react';
import { SocialLoginButtons } from './SocialLoginButtons';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { PasswordInput } from './PasswordInput';

const parentFormSchema = z.object({
  email: z.string().trim().email({ message: "Invalid email address" }).max(255),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  name: z.string().trim().min(2, { message: "Name is required" }).max(100),
  phone: z.string().trim().min(10, { message: "Valid phone number required" }).max(20),
});

const loginSchema = z.object({
  email: z.string().trim().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

interface ParentRegistrationProps {
  onBack: () => void;
  onComplete: (data: { 
    email: string; 
    password?: string;
    name: string; 
    phone: string;
    selectedChildId: string;
    selectedChildName: string;
    isSignIn?: boolean;
  }) => void;
}

interface StudentResult {
  user_id: string;
  full_name: string;
  current_class: string | null;
  student_card: string | null;
  avatar_url: string | null;
  source: 'profile' | 'registry';
}

export const ParentRegistration: React.FC<ParentRegistrationProps> = ({ onBack, onComplete }) => {
  const [authTab, setAuthTab] = useState<'signin' | 'register'>('signin');
  
  // Sign-in state
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Registration state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
  });
  const [searchType, setSearchType] = useState<'name' | 'card'>('name');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StudentResult[]>([]);
  const [selectedChild, setSelectedChild] = useState<StudentResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'account' | 'search'>('account');

  useEffect(() => {
    if (step === 'search' && searchQuery.length >= 2) {
      const debounce = setTimeout(() => {
        handleSearch();
      }, 300);
      return () => clearTimeout(debounce);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, searchType, step]);

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setIsSearching(true);

    try {
      const { data, error } = await supabase.rpc('search_students_for_parent', {
        _search: searchQuery,
        _search_by: searchType === 'name' ? 'name' : 'card',
      });

      if (error) {
        console.error('Search error:', error);
        toast.error('Failed to search. Please try again.');
        setSearchResults([]);
      } else {
        const results: StudentResult[] = (data || []).map((s: any) => ({
          user_id: s.user_id,
          full_name: s.full_name,
          current_class: s.current_class,
          student_card: s.student_card,
          avatar_url: s.avatar_url,
          source: s.source as 'profile' | 'registry',
        }));
        
        const seen = new Set<string>();
        const unique = results.filter(r => {
          const key = r.student_card || r.user_id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        
        setSearchResults(unique);
      }
    } catch (err) {
      console.error('Search error:', err);
      toast.error('Failed to search. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectChild = (student: StudentResult) => {
    setSelectedChild(student);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = loginSchema.safeParse(loginData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setLoginErrors(fieldErrors);
      return;
    }
    setLoginErrors({});
    setIsSigningIn(true);

    // Pass to parent handler with isSignIn flag
    await onComplete({
      email: loginData.email,
      password: loginData.password,
      name: '',
      phone: '',
      selectedChildId: '',
      selectedChildName: '',
      isSignIn: true,
    });

    setIsSigningIn(false);
  };

  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = parentFormSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }
    
    setErrors({});
    setStep('search');
  };

  const handleFinalSubmit = async () => {
    if (!selectedChild) {
      toast.error('Please select your child to continue');
      return;
    }
    
    setIsLoading(true);
    
    await onComplete({
      email: formData.email,
      password: formData.password,
      name: formData.name,
      phone: formData.phone,
      selectedChildId: selectedChild.user_id,
      selectedChildName: selectedChild.full_name,
    });
    
    setIsLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={step === 'search' ? () => setStep('account') : onBack}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Parent Portal</h2>
            <p className="text-sm text-muted-foreground">
              {step === 'search' ? 'Step 2: Find your child' : 'Sign in or create your account'}
            </p>
          </div>
        </div>
      </div>

      {step === 'account' && (
        <Tabs value={authTab} onValueChange={(v) => setAuthTab(v as 'signin' | 'register')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="register">Create Account</TabsTrigger>
          </TabsList>

          {/* SIGN IN TAB */}
          <TabsContent value="signin" className="space-y-4 mt-4">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email Address
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="parent@example.com"
                  value={loginData.email}
                  onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                  className={loginErrors.email ? 'border-destructive' : ''}
                  required
                />
                {loginErrors.email && <p className="text-xs text-destructive">{loginErrors.email}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password" className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Password
                </Label>
                <PasswordInput
                  id="login-password"
                  placeholder="Enter your password"
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  className={loginErrors.password ? 'border-destructive' : ''}
                  required
                />
                {loginErrors.password && <p className="text-xs text-destructive">{loginErrors.password}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={isSigningIn}>
                {isSigningIn ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </TabsContent>

          {/* REGISTER TAB */}
          <TabsContent value="register" className="space-y-4 mt-4">
            <SocialLoginButtons />

            <div className="relative flex items-center justify-center">
              <Separator className="flex-1" />
              <span className="px-3 text-xs text-muted-foreground uppercase bg-background/50 backdrop-blur-sm rounded-full">
                Or continue with email
              </span>
              <Separator className="flex-1" />
            </div>

            <form onSubmit={handleAccountSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Full Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={errors.name ? 'border-destructive' : ''}
                  required
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="parent@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={errors.email ? 'border-destructive' : ''}
                  required
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Password
                </Label>
                <PasswordInput
                  id="password"
                  placeholder="Create a secure password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={errors.password ? 'border-destructive' : ''}
                  required
                  minLength={6}
                />
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Phone Number (for SMS notifications)
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1234567890"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className={errors.phone ? 'border-destructive' : ''}
                  required
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                <p className="text-xs text-muted-foreground">
                  You will receive SMS alerts about your child's exams
                </p>
              </div>

              <Button type="submit" className="w-full">
                Continue to Find Your Child
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      )}

      {step === 'search' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className={`flex-1 h-2 rounded-full bg-primary`} />
            <div className={`flex-1 h-2 rounded-full bg-primary`} />
          </div>

          <Card className="bg-secondary/30">
            <CardContent className="flex items-center gap-3 p-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{formData.name}</p>
                <p className="text-sm text-muted-foreground">{formData.email}</p>
              </div>
              <Check className="h-5 w-5 text-primary" />
            </CardContent>
          </Card>

          <p className="text-sm text-muted-foreground text-center">
            Search for your child by name or student card number.
          </p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={searchType === 'name' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setSearchType('name'); setSearchQuery(''); setSearchResults([]); }}
              className="flex-1"
            >
              <User className="h-4 w-4 mr-2" />
              By Name
            </Button>
            <Button
              type="button"
              variant={searchType === 'card' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setSearchType('card'); setSearchQuery(''); setSearchResults([]); }}
              className="flex-1"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              By Student Card
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={searchType === 'name' ? "Enter child's name..." : "Enter student card number..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          {isSearching && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Found {searchResults.length} student{searchResults.length > 1 ? 's' : ''}:
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {searchResults.map((student) => (
                  <Card 
                    key={`${student.source}-${student.user_id}`}
                    className={`cursor-pointer transition-all hover:border-primary ${
                      selectedChild?.user_id === student.user_id && selectedChild?.source === student.source
                        ? 'border-primary bg-primary/5' : ''
                    }`}
                    onClick={() => handleSelectChild(student)}
                  >
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                        <GraduationCap className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{student.full_name}</p>
                          {student.source === 'registry' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning-foreground">
                              Pre-registered
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {student.current_class && <span>{student.current_class}</span>}
                          {student.student_card && (
                            <>
                              <span>•</span>
                              <span>ID: {student.student_card}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Check className={`h-5 w-5 ${
                        selectedChild?.user_id === student.user_id && selectedChild?.source === student.source
                          ? 'text-primary' : 'text-transparent'
                      }`} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              No students found matching your search.
            </p>
          )}

          {selectedChild && (
            <div className="space-y-4 pt-4 border-t border-border">
              <Card className="border-primary bg-primary/5">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <GraduationCap className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Selected: {selectedChild.full_name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {selectedChild.current_class && <span>{selectedChild.current_class}</span>}
                      {selectedChild.student_card && (
                        <>
                          <span>•</span>
                          <span>ID: {selectedChild.student_card}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Check className="h-5 w-5 text-primary" />
                </CardContent>
              </Card>

              <Button 
                onClick={handleFinalSubmit} 
                className="w-full" 
                disabled={isLoading}
              >
                {isLoading ? 'Creating Account & Sending Request...' : 'Create Account & Send Request'}
              </Button>
              
              <p className="text-xs text-muted-foreground text-center">
                Your link to {selectedChild.full_name} will be sent to admin for approval. You'll access child data once approved.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
