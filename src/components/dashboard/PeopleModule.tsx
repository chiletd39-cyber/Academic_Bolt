import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Users, GraduationCap, BookOpen, Shield } from 'lucide-react';
import { ClassesModule } from './ClassesModule';

interface Person {
  id: string;
  user_id: string;
  full_name: string;
  role: 'student' | 'teacher' | 'admin';
  current_class: string | null;
  avatar_url: string | null;
  phone?: string | null;
  student_card?: string | null;
}

const PeopleList = () => {
  const { profile, role } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'student' | 'teacher'>('all');

  useEffect(() => {
    fetchPeople();
  }, [profile, filter, role]);

  const fetchPeople = async () => {
    setLoading(true);

    if (role === 'admin' || role === 'teacher') {
      // Staff can query profiles table directly (RLS allows it)
      let query = supabase.from('profiles').select('*');
      
      if (role === 'teacher') {
        if (filter !== 'all') {
          query = query.eq('role', filter);
        } else {
          query = query.in('role', ['student', 'teacher']);
        }
      } else if (filter !== 'all') {
        query = query.eq('role', filter);
      }

      const { data } = await query.order('full_name');
      setPeople((data as Person[]) || []);
    } else {
      // Students/parents use the secure RPC (limited fields, no PII)
      const classFilter = (role === 'student' && filter !== 'teacher') ? profile?.current_class || null : null;
      const roleFilter = filter === 'all' ? null : filter;

      const { data } = await supabase.rpc('get_public_profiles', {
        _class_name: classFilter,
        _role_filter: roleFilter,
      });

      // If student wants 'all', also fetch teachers
      if (role === 'student' && filter === 'all' && profile?.current_class) {
        const { data: teachers } = await supabase.rpc('get_public_profiles', {
          _class_name: null,
          _role_filter: 'teacher',
        });
        const combined = [...(data || []), ...(teachers || [])];
        // Deduplicate
        const seen = new Set<string>();
        const unique = combined.filter(p => {
          if (seen.has(p.user_id)) return false;
          seen.add(p.user_id);
          return true;
        });
        setPeople(unique as Person[]);
      } else {
        setPeople((data as Person[]) || []);
      }
    }

    setLoading(false);
  };

  const filteredPeople = people.filter(person => {
    const q = searchQuery.toLowerCase();
    if (role === 'student') {
      return person.full_name.toLowerCase().includes(q);
    }
    if (role === 'teacher') {
      return (
        person.full_name.toLowerCase().includes(q) ||
        person.current_class?.toLowerCase().includes(q)
      );
    }
    return (
      person.full_name.toLowerCase().includes(q) ||
      person.student_card?.toLowerCase().includes(q) ||
      person.current_class?.toLowerCase().includes(q)
    );
  });

  const getRoleIcon = (r: string) => {
    switch (r) {
      case 'student': return <GraduationCap className="w-4 h-4" />;
      case 'teacher': return <BookOpen className="w-4 h-4" />;
      case 'admin': return <Shield className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  const getRoleColor = (r: string) => {
    switch (r) {
      case 'student': return 'bg-primary/10 text-primary';
      case 'teacher': return 'bg-accent/20 text-accent-foreground';
      case 'admin': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">People</h2>
          <p className="text-muted-foreground">
            {role === 'student' ? 'Your classmates and teachers' :
             role === 'teacher' ? 'Students and fellow teachers' :
             'All users in the system'}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={
              role === 'student' ? 'Search by name...' :
              role === 'teacher' ? 'Search by name or class...' :
              'Search by name, card, or class...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Badge 
            variant={filter === 'all' ? 'default' : 'outline'} 
            className="cursor-pointer px-4 py-2"
            onClick={() => setFilter('all')}
          >
            All
          </Badge>
          <Badge 
            variant={filter === 'student' ? 'default' : 'outline'} 
            className="cursor-pointer px-4 py-2"
            onClick={() => setFilter('student')}
          >
            Students
          </Badge>
          <Badge 
            variant={filter === 'teacher' ? 'default' : 'outline'} 
            className="cursor-pointer px-4 py-2"
            onClick={() => setFilter('teacher')}
          >
            Teachers
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPeople.map((person) => (
          <Card key={person.id || person.user_id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={person.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {person.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{person.full_name}</h3>
                  
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${getRoleColor(person.role)}`}>
                      {getRoleIcon(person.role)}
                      <span className="capitalize">{person.role}</span>
                    </span>
                  </div>

                  {person.current_class && (role === 'admin' || role === 'teacher') && (
                    <p className="text-sm text-muted-foreground mt-1">{person.current_class}</p>
                  )}

                  {person.student_card && role === 'admin' && (
                    <p className="text-xs text-muted-foreground">#{person.student_card}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredPeople.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">No people found</p>
        </div>
      )}
    </div>
  );
};

export const PeopleModule = () => {
  const { role } = useAuth();
  const isStaff = role === 'admin' || role === 'teacher';

  if (!isStaff) {
    return <PeopleList />;
  }

  return (
    <Tabs defaultValue="classes" className="space-y-6">
      <TabsList>
        <TabsTrigger value="classes">Classes Management</TabsTrigger>
        <TabsTrigger value="people">People</TabsTrigger>
      </TabsList>
      <TabsContent value="classes">
        <ClassesModule />
      </TabsContent>
      <TabsContent value="people">
        <PeopleList />
      </TabsContent>
    </Tabs>
  );
};
