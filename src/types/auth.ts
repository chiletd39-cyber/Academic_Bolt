export type UserRole = 'student' | 'teacher' | 'admin';

export interface UserProfile {
  id: string;
  role: UserRole;
  email: string;
  name: string;
  phone?: string;
  studentCard?: string;
  className?: string;
  avatarUrl?: string;
  createdAt: Date;
}

export interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  role: UserRole | null;
}

export interface StudentRegistrationData {
  email: string;
  name: string;
  studentCard: string;
  className: string;
  phone: string;
}

export interface TeacherRegistrationData {
  email: string;
  name: string;
  phone: string;
}

export interface AdminLoginData {
  email: string;
  code: string;
}
