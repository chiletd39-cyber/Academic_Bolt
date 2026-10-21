import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { GraduationCap, BookOpen, Shield, Users } from 'lucide-react';

type UserRole = 'student' | 'teacher' | 'admin' | 'parent';

interface RoleCardProps {
  role: UserRole;
  title?: string;
  description?: string;
  isSelected?: boolean;
  onSelect?: (role: UserRole) => void;
  onClick?: () => void;
}

const roleConfig = {
  student: {
    icon: GraduationCap,
    title: 'Students',
    description: 'Access exams, view grades, track your progress',
    gradient: 'from-blue-500/20 to-cyan-500/20',
    hoverGradient: 'group-hover:from-blue-500/30 group-hover:to-cyan-500/30',
  },
  teacher: {
    icon: BookOpen,
    title: 'Teachers',
    description: 'Create exams, monitor students, grade work',
    gradient: 'from-emerald-500/20 to-teal-500/20',
    hoverGradient: 'group-hover:from-emerald-500/30 group-hover:to-teal-500/30',
  },
  admin: {
    icon: Shield,
    title: 'Admin',
    description: 'Manage classes, users, and system settings',
    gradient: 'from-purple-500/20 to-pink-500/20',
    hoverGradient: 'group-hover:from-purple-500/30 group-hover:to-pink-500/30',
  },
  parent: {
    icon: Users,
    title: 'Parent',
    description: 'View your child\'s academic progress',
    gradient: 'from-orange-500/20 to-amber-500/20',
    hoverGradient: 'group-hover:from-orange-500/30 group-hover:to-amber-500/30',
  },
};

export const RoleCard = forwardRef<HTMLButtonElement, RoleCardProps>(({ 
  role, 
  title,
  description,
  onSelect, 
  onClick 
}, ref) => {
  const config = roleConfig[role];
  const Icon = config.icon;
  const displayTitle = title || config.title;
  const displayDescription = description || config.description;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (onSelect) {
      onSelect(role);
    }
  };

  return (
    <button
      ref={ref}
      onClick={handleClick}
      className={cn(
        'group relative flex flex-col items-center justify-center p-6 md:p-8 rounded-2xl',
        'bg-card border border-border/50 overflow-hidden',
        'transition-all duration-500 hover:shadow-lg hover:-translate-y-2',
        'focus:outline-none focus:ring-2 focus:ring-primary/50',
        'backdrop-blur-sm w-full'
      )}
    >
      {/* Animated gradient background */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-500',
        config.gradient,
        config.hoverGradient,
        'group-hover:opacity-100'
      )} />
      
      {/* Animated glow effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent blur-sm" />
      </div>

      {/* Content - centered */}
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className={cn(
          'flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full',
          'border-2 border-primary mb-4',
          'transition-all duration-500',
          'group-hover:bg-primary group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/25'
        )}>
          <Icon className="w-6 h-6 md:w-7 md:h-7 text-primary group-hover:text-primary-foreground transition-colors duration-300" />
        </div>
        <h3 className="text-base md:text-lg font-semibold text-foreground mb-2">{displayTitle}</h3>
        <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
          {displayDescription}
        </p>
      </div>
      
      {/* Subtle pulse animation on hover */}
      <div className="absolute inset-0 rounded-2xl border-2 border-primary/0 group-hover:border-primary/20 transition-all duration-500 group-hover:animate-pulse" />
    </button>
  );
});

RoleCard.displayName = 'RoleCard';
