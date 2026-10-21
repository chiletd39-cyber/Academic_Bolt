import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Shield,
  Monitor,
  BarChart3,
  Users,
  Clock,
  Eye,
  FileText,
  Bell,
  GraduationCap,
  BookOpen,
  CheckCircle,
  Globe,
  Lock,
  Zap,
} from 'lucide-react';

const features = [
  {
    icon: Monitor,
    title: 'Secure Online Exams',
    description: 'Students take exams in a fully monitored environment with webcam, microphone, and screen protection to ensure academic integrity.',
  },
  {
    icon: Eye,
    title: 'Real-Time Monitoring',
    description: 'Teachers and admins can watch live exam sessions, track eye movements, and detect suspicious activity as it happens.',
  },
  {
    icon: BarChart3,
    title: 'Instant Analytics',
    description: 'Get detailed performance reports, class rankings, score distributions, and trend analysis — all generated automatically.',
  },
  {
    icon: Shield,
    title: 'Anti-Cheating Protection',
    description: 'Built-in tab-switch detection, fullscreen enforcement, right-click blocking, and AI-powered eye tracking keep exams fair.',
  },
  {
    icon: FileText,
    title: 'Report Card Generation',
    description: 'Automatically generate and distribute professional report cards based on exam scores, terms, and subjects.',
  },
  {
    icon: Users,
    title: 'Parent Portal',
    description: "Parents can track their child's academic progress, view rankings, exam results, and receive real-time notifications.",
  },
  {
    icon: Clock,
    title: 'Timed Assessments',
    description: 'Set precise durations for each exam with automatic submission when time runs out — no late submissions possible.',
  },
  {
    icon: Bell,
    title: 'Smart Notifications',
    description: 'Students, teachers, and parents receive instant alerts for exam schedules, results, violations, and important updates.',
  },
];

const howItWorks = [
  {
    step: '1',
    icon: GraduationCap,
    title: 'Register & Join',
    description: 'Students register with their student card, teachers sign up to manage classes, and parents link to their children — all in minutes.',
  },
  {
    step: '2',
    icon: BookOpen,
    title: 'Create & Assign Exams',
    description: 'Teachers create exams with multiple question types, set time limits, enable security features, and assign them to specific classes.',
  },
  {
    step: '3',
    icon: Lock,
    title: 'Take Exams Securely',
    description: 'Students enter a locked exam environment with webcam monitoring, eye tracking, and anti-cheat protection — ensuring fairness for everyone.',
  },
  {
    step: '4',
    icon: BarChart3,
    title: 'View Results & Reports',
    description: 'Scores are calculated instantly. Students, parents, and teachers can view detailed analytics, rankings, and downloadable report cards.',
  },
];

const roleDescriptions = [
  {
    icon: GraduationCap,
    role: 'Students',
    benefits: [
      'Take exams from anywhere with internet access',
      'View scores, rankings, and detailed feedback instantly',
      'Track academic progress across terms and subjects',
      'Receive notifications for upcoming exams and results',
    ],
  },
  {
    icon: BookOpen,
    role: 'Teachers',
    benefits: [
      'Create exams with MCQ, essay, true/false, and short answer questions',
      'Monitor students in real-time during exams via live dashboard',
      'Import questions and student lists from files for quick setup',
      'Generate report cards and performance analytics automatically',
    ],
  },
  {
    icon: Users,
    role: 'Parents',
    benefits: [
      "View your child's exam scores and class rankings",
      'Receive instant notifications on exam results and violations',
      'Track academic progress across all terms and subjects',
      'Stay connected with your child\'s educational journey',
    ],
  },
  {
    icon: Shield,
    role: 'Administrators',
    benefits: [
      'Manage all users, classes, subjects, and terms from one dashboard',
      'Verify parent-child links and approve class switch requests',
      'Access system-wide analytics and exam integrity reports',
      'Control security settings and manage admin access codes',
    ],
  },
];

const stats = [
  { value: '100%', label: 'Exam Integrity', icon: Shield },
  { value: '24/7', label: 'Access Anywhere', icon: Globe },
  { value: 'Instant', label: 'Results & Reports', icon: Zap },
  { value: 'Real-Time', label: 'Live Monitoring', icon: Eye },
];

export const FeaturesSection = memo(() => (
  <section className="py-8 px-4 space-y-12">
    {/* About the Platform */}
    <div className="max-w-4xl mx-auto text-center animate-fade-in">
      <Card className="border-primary/20 bg-primary/5 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        <CardContent className="p-6 md:p-8 relative">
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground mb-3">
            About This Platform
          </h2>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            World Mission High School Online Examination System is a comprehensive digital platform
            designed to transform the way academic assessments are conducted. It provides a secure,
            transparent, and efficient environment for students, teachers, parents, and administrators
            to manage the entire examination lifecycle — from creating and assigning exams to
            monitoring sessions in real-time and generating detailed report cards.
          </p>
        </CardContent>
      </Card>
    </div>

    {/* Stats Bar */}
    <div className="max-w-4xl mx-auto animate-fade-in" style={{ animationDelay: '100ms' }}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((stat, i) => (
          <Card key={stat.label} className="text-center border-border/50 group hover:border-primary/30 hover:shadow-md transition-all duration-300" style={{ animationDelay: `${i * 50}ms` }}>
            <CardContent className="p-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="text-lg font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>

    {/* Features Grid */}
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-6">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">
          Everything You Need for Academic Excellence
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl mx-auto text-sm">
          A comprehensive platform that connects students, teachers, parents, and administrators.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {features.map((feature, i) => (
          <Card key={feature.title} className="group hover:shadow-md transition-all duration-300 border-border/50 hover:border-primary/20 hover:-translate-y-1" style={{ animationDelay: `${i * 50}ms` }}>
            <CardContent className="p-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3 mx-auto group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-sm mb-1 text-center">{feature.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed text-center">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>

    {/* How It Works */}
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-6">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">How It Works</h2>
        <p className="text-muted-foreground mt-1 text-sm">Simple steps to get started</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {howItWorks.map((item, i) => (
          <Card key={item.step} className="border-border/50 hover:shadow-md hover:-translate-y-1 transition-all duration-300" style={{ animationDelay: `${i * 80}ms` }}>
            <CardContent className="p-4 flex flex-col items-center text-center gap-3">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-bold text-primary">{item.step}</span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center">
                <item.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">{item.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>

    {/* Role Benefits */}
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-6">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">Built for Every Role</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          See what the platform offers for your specific role
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roleDescriptions.map((role, i) => (
          <Card key={role.role} className="border-border/50 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group" style={{ animationDelay: `${i * 80}ms` }}>
            <CardContent className="p-5">
              <div className="flex flex-col items-center text-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <role.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{role.role}</h3>
              </div>
              <ul className="space-y-2">
                {role.benefits.map((benefit, j) => (
                  <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>

    {/* Security Highlight */}
    <div className="max-w-4xl mx-auto">
      <Card className="border-primary/20 bg-primary/5 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/10" />
        <CardContent className="p-5 flex flex-col sm:flex-row items-center gap-4 relative">
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 animate-pulse">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center sm:text-left">
            <h3 className="font-semibold text-foreground">Built for Security & Speed</h3>
            <p className="text-sm text-muted-foreground">
              Enterprise-grade security with real-time data sync. Your exam data is encrypted,
              access-controlled, and always available — ensuring fair assessments for every student.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>
));
FeaturesSection.displayName = 'FeaturesSection';
