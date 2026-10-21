import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoleCard } from './RoleCard';
import { StudentRegistration } from './StudentRegistration';
import { TeacherRegistration } from './TeacherRegistration';
import { AdminLogin } from './AdminLogin';
import { ParentRegistration } from './ParentRegistration';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import schoolLogo from '@/assets/school-logo.png';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { registerFailure, clearAttempts, attemptMessage } from '@/lib/loginAttempts';

// Detect a wrong-password error from Supabase Auth (message text is stable).
const isBadPassword = (msg?: string) =>
  !!msg && /invalid login credentials/i.test(msg);

type AuthStep = 'role-select' | 'student-register' | 'teacher-register' | 'admin-login' | 'parent-register';

// Helper: after sign-in, verify the user's profile role matches expected role
const verifyRoleAfterSignIn = async (expectedRole: string): Promise<{ valid: boolean; actualRole?: string }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { valid: false };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) return { valid: false };

  if (profile.role !== expectedRole) {
    // Role mismatch — sign out to prevent auto-redirect, no dashboard access
    await supabase.auth.signOut();
    return { valid: false, actualRole: profile.role };
  }

  return { valid: true };
};

export const LoginPage: React.FC = () => {
  const [step, setStep] = useState<AuthStep>('role-select');
  const [isVerifying, setIsVerifying] = useState(false);
  const navigate = useNavigate();
  const { signUp, signIn, verifyAdminCode, isLoading, isAuthenticated, profile } = useAuth();

  // Only auto-redirect if already authenticated AND profile is loaded (role confirmed)
  useEffect(() => {
    if (isAuthenticated && profile && !isVerifying) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, profile, isVerifying, navigate]);

  const handleRoleSelect = (role: 'student' | 'teacher' | 'admin' | 'parent') => {
    if (role === 'student') setStep('student-register');
    else if (role === 'teacher') setStep('teacher-register');
    else if (role === 'parent') setStep('parent-register');
    else setStep('admin-login');
  };

  const handleStudentComplete = async (data: { 
    email: string; 
    password?: string;
    name: string; 
    studentCard: string; 
    className: string; 
    phone: string 
  }) => {
    if (!data.password) {
      toast.error('Password is required');
      return;
    }

    try {
      setIsVerifying(true);
      // Try to sign in first (for existing users)
      const { error: signInError } = await signIn(data.email, data.password);
      
      if (!signInError) {
        const roleCheck = await verifyRoleAfterSignIn('student');
        if (!roleCheck.valid) {
          setIsVerifying(false);
          toast.error(roleCheck.actualRole 
            ? `This account is registered as "${roleCheck.actualRole}". Please use the correct role to sign in.`
            : 'Account not found. Please register first.');
          return;
        }
        clearAttempts('student', data.email);
        setIsVerifying(false);
        toast.success('Welcome back!');
        navigate('/dashboard');
        return;
      }

      // For new registrations, verify student card was validated
      if (!data.studentCard) {
        setIsVerifying(false);
        toast.error('Please complete registration with a valid student card');
        return;
      }

      // Create new account. If this email already exists, Supabase returns
      // "already registered" — that means the sign-in above failed because the
      // password was wrong, so count it as a password attempt.
      const { error } = await signUp(data.email, data.password, {
        role: 'student',
        full_name: data.name,
        student_card: data.studentCard,
        current_class: data.className,
        phone: data.phone,
      });

      if (error) {
        setIsVerifying(false);
        if (error.message.includes('already registered') || error.message.includes('already been registered')) {
          const left = registerFailure('student', data.email, 'password');
          toast.error(attemptMessage('password', left));
        } else {
          toast.error(error.message);
        }
      } else {
        // Mark student card as registered
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.id) {
          await supabase
            .from('registered_students')
            .update({ is_registered: true, registered_user_id: userData.user.id })
            .eq('student_card', data.studentCard);
        }
          
        toast.success('Account created! Add two-factor security or skip.');
        navigate('/mfa?setup=1&optional=1');
      }
    } catch (err) {
      setIsVerifying(false);
      console.error('Student login error:', err);
      toast.error('Connection error. Please check your internet and try again.');
    }
  };

  const handleTeacherComplete = async (data: { 
    email: string; 
    password?: string;
    name: string; 
    phone: string 
  }) => {
    if (!data.password) {
      toast.error('Password is required');
      return;
    }

    try {
      setIsVerifying(true);
      // Try to sign in first
      const { error: signInError } = await signIn(data.email, data.password);
      
      if (!signInError) {
        const roleCheck = await verifyRoleAfterSignIn('teacher');
        if (!roleCheck.valid) {
          setIsVerifying(false);
          toast.error(roleCheck.actualRole 
            ? `This account is registered as "${roleCheck.actualRole}". Please use the correct role to sign in.`
            : 'Account not found. Please register first.');
          return;
        }
        clearAttempts('teacher', data.email);
        setIsVerifying(false);
        toast.success('Welcome back!');
        navigate('/dashboard');
        return;
      }

      // Wrong-password path (existing account): count the miss, do NOT try to sign up over it.
      if (isBadPassword(signInError.message)) {
        // Attempt a signup — if the email is unused, this creates a new teacher.
        // If it's already registered, Supabase returns an "already registered" error,
        // which means the password was wrong for an existing account.
        const { error } = await signUp(data.email, data.password, {
          role: 'teacher',
          full_name: data.name,
          phone: data.phone,
        });

        if (error) {
          if (error.message.includes('already registered') || error.message.includes('already been registered')) {
            const left = registerFailure('teacher', data.email, 'password');
            setIsVerifying(false);
            toast.error(attemptMessage('password', left));
          } else {
            setIsVerifying(false);
            toast.error(error.message);
          }
        } else {
          setIsVerifying(false);
          toast.success('Account created! Add two-factor security or skip.');
          navigate('/mfa?setup=1&optional=1');
        }
        return;
      }

      setIsVerifying(false);
      toast.error(signInError.message || 'Login failed. Please try again.');
    } catch (err) {
      setIsVerifying(false);
      console.error('Teacher login error:', err);
      toast.error('Connection error. Please check your internet and try again.');
    }
  };

  const handleAdminComplete = async (data: { email: string; code: string; password?: string }) => {
    // Admin login now requires BOTH a valid security code AND a password.
    // We validate each independently so the user knows exactly which one was wrong,
    // and we surface how many attempts remain (max 6 per field before lockout).
    if (!data.code?.trim()) {
      toast.error('Security code is required');
      return;
    }
    if (!data.password?.trim()) {
      toast.error('Password is required');
      return;
    }

    try {
      setIsVerifying(true);

      // 1) Verify the admin security code first (server-side, rate-limited).
      let isValidCode = false;
      try {
        isValidCode = await verifyAdminCode(data.code);
      } catch (e: any) {
        setIsVerifying(false);
        // Server said "Too many attempts" (rate limit) or transient error — surface it verbatim.
        toast.error(e?.message || 'Could not verify security code. Please try again shortly.');
        return;
      }
      if (!isValidCode) {
        const left = registerFailure('admin', data.email, 'admin_code');
        setIsVerifying(false);
        toast.error(attemptMessage('admin_code', left));
        return;
      }

      // 2) Code is valid → attempt password sign-in for an existing admin.
      const { error: signInError } = await signIn(data.email, data.password);

      if (!signInError) {
        const roleCheck = await verifyRoleAfterSignIn('admin');
        if (!roleCheck.valid) {
          setIsVerifying(false);
          toast.error(roleCheck.actualRole
            ? `This account is registered as "${roleCheck.actualRole}", not as admin.`
            : 'Account not found.');
          return;
        }
        clearAttempts('admin', data.email);
        setIsVerifying(false);
        toast.success('Welcome, Admin!');
        navigate('/dashboard');
        return;
      }

      // 3) Sign-in failed. If it's a bad-password error, the account might either
      //    not exist yet (→ create new admin) or exist with a different password
      //    (→ report a wrong-password attempt with tries left).
      if (isBadPassword(signInError.message)) {
        const { error: signUpError } = await signUp(data.email, data.password, {
          role: 'admin',
          full_name: 'Administrator',
          admin_code: data.code,
        });

        if (!signUpError) {
          clearAttempts('admin', data.email);
          setIsVerifying(false);
          toast.success('Admin account created! Add two-factor security or skip.');
          navigate('/mfa?setup=1&optional=1');
          return;
        }

        const errMsg = signUpError.message.toLowerCase();
        if (errMsg.includes('already registered') || errMsg.includes('already exists')) {
          // Existing admin with wrong password → count as password failure.
          const left = registerFailure('admin', data.email, 'password');
          setIsVerifying(false);
          toast.error(attemptMessage('password', left));
        } else {
          setIsVerifying(false);
          toast.error(signUpError.message);
        }
        return;
      }

      setIsVerifying(false);
      toast.error(signInError.message || 'Sign-in failed. Please try again.');
    } catch (err) {
      setIsVerifying(false);
      console.error('Admin login error:', err);
      toast.error('Connection error. Please try again.');
    }
  };

  const handleParentComplete = async (data: { 
    email: string; 
    password?: string;
    name: string; 
    phone: string;
    selectedChildId: string;
    selectedChildName: string;
    isSignIn?: boolean;
  }) => {
    if (!data.password) {
      toast.error('Password is required');
      return;
    }

    // Pure sign-in flow (existing parent)
    if (data.isSignIn) {
      setIsVerifying(true);
      const { error: signInError } = await signIn(data.email, data.password);
      
      if (signInError) {
        setIsVerifying(false);
        if (isBadPassword(signInError.message)) {
          const left = registerFailure('parent', data.email, 'password');
          toast.error(attemptMessage('password', left));
        } else {
          toast.error(signInError.message || 'Sign-in failed. Please try again.');
        }
        return;
      }

      const roleCheck = await verifyRoleAfterSignIn('parent');
      if (!roleCheck.valid) {
        setIsVerifying(false);
        toast.error(roleCheck.actualRole 
          ? `This account is registered as "${roleCheck.actualRole}". Please use the correct role to sign in.`
          : 'Account not found. Please register first.');
        return;
      }
      clearAttempts('parent', data.email);
      setIsVerifying(false);
      toast.success('Welcome back!');
      navigate('/dashboard');
      return;
    }

    // Registration flow
    setIsVerifying(true);
    
    // Try sign in first (existing account)
    const { error: signInError } = await signIn(data.email, data.password);
    if (!signInError) {
      const roleCheck = await verifyRoleAfterSignIn('parent');
      if (!roleCheck.valid) {
        setIsVerifying(false);
        toast.error(roleCheck.actualRole 
          ? `This account is registered as "${roleCheck.actualRole}". Please use the correct role.`
          : 'Account issue. Please try again.');
        return;
      }
      // Already have account, just link child
      const user = (await supabase.auth.getUser()).data.user;
      if (user && data.selectedChildId) {
        await supabase.from('parent_children').insert({
          parent_id: user.id,
          student_id: data.selectedChildId,
          verified: false,
        });
      }
      clearAttempts('parent', data.email);
      setIsVerifying(false);
      toast.success('Welcome back! Child link request sent to admin.');
      navigate('/dashboard');
      return;
    }
    setIsVerifying(false);

    // Create new parent account
    const { error } = await signUp(data.email, data.password, {
      role: 'parent',
      full_name: data.name,
      phone: data.phone,
    });

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        // Existing account with wrong password → count as password attempt.
        const left = registerFailure('parent', data.email, 'password');
        toast.error(attemptMessage('password', left));
      } else {
        toast.error(error.message);
      }
      return;
    }

    // Link parent to selected child
    const user = (await supabase.auth.getUser()).data.user;
    if (user && data.selectedChildId) {
      await supabase.from('parent_children').insert({
        parent_id: user.id,
        student_id: data.selectedChildId,
        verified: false,
      });
    }

    toast.success('Account created! Link to ' + data.selectedChildName + ' pending approval. Add 2FA or skip.');
    navigate('/mfa?setup=1&optional=1');
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-secondary/30">
      {/* Header Section */}
      <div className="bg-primary py-8 px-4">
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <img 
            src={schoolLogo} 
            alt="World Mission High School" 
            className="w-24 h-24 object-contain mb-4 rounded-full bg-white p-2"
          />
          <h1 className="text-2xl md:text-3xl font-bold text-primary-foreground">
            WORLD MISSION HIGH SCHOOL
          </h1>
          <p className="text-primary-foreground/90 text-lg mt-1">
            ONLINE EXAMINATION SYSTEM
          </p>
          <p className="text-[hsl(45,93%,58%)] text-sm mt-2 italic font-medium drop-shadow-sm">
            "Excellence in Education, Faith in Action"
          </p>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 flex items-start justify-center p-6 pt-8">
        <div className="w-full max-w-4xl">
          {step === 'role-select' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-foreground">CONTINUE AS</h2>
                <p className="text-muted-foreground mt-2">Select your role to proceed</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                <RoleCard
                  role="student"
                  title="Student"
                  description="Access exams and view grades"
                  onClick={() => handleRoleSelect('student')}
                />
                <RoleCard
                  role="teacher"
                  title="Teacher"
                  description="Create and monitor exams"
                  onClick={() => handleRoleSelect('teacher')}
                />
                <RoleCard
                  role="parent"
                  title="Parent"
                  description="View your child's progress"
                  onClick={() => handleRoleSelect('parent')}
                />
                <RoleCard
                  role="admin"
                  title="Admin"
                  description="System management"
                  onClick={() => handleRoleSelect('admin')}
                />
              </div>

              {/* Features Section */}
              <FeaturesSection />
            </div>
          )}

          {step === 'student-register' && (
            <div className="max-w-md mx-auto bg-primary/5 rounded-2xl shadow-lg p-6 animate-fade-in border border-primary/20 backdrop-blur-sm">
              <StudentRegistration
                onBack={() => setStep('role-select')}
                onComplete={handleStudentComplete}
              />
            </div>
          )}

          {step === 'teacher-register' && (
            <div className="max-w-md mx-auto bg-primary/5 rounded-2xl shadow-lg p-6 animate-fade-in border border-primary/20 backdrop-blur-sm">
              <TeacherRegistration
                onBack={() => setStep('role-select')}
                onComplete={handleTeacherComplete}
              />
            </div>
          )}

          {step === 'admin-login' && (
            <div className="max-w-md mx-auto bg-primary/5 rounded-2xl shadow-lg p-6 animate-fade-in border border-primary/20 backdrop-blur-sm">
              <AdminLogin
                onBack={() => setStep('role-select')}
                onComplete={handleAdminComplete}
              />
            </div>
          )}

          {step === 'parent-register' && (
            <div className="max-w-md mx-auto bg-primary/5 rounded-2xl shadow-lg p-6 animate-fade-in border border-primary/20 backdrop-blur-sm">
              <ParentRegistration
                onBack={() => setStep('role-select')}
                onComplete={handleParentComplete}
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-muted-foreground border-t border-border">
        <p>© 2025 World Mission High School. All rights reserved.</p>
      </footer>
    </div>
  );
};
