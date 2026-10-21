import { useState, useEffect, useCallback, memo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Search, Users, GraduationCap, BookOpen, Shield, UserPlus, Eye, X, Link2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface User {
  id: string;
  user_id: string;
  full_name: string;
  role: 'student' | 'teacher' | 'admin' | 'parent';
  current_class: string | null;
  avatar_url: string | null;
  phone: string | null;
  student_card: string | null;
  teacher_mcode: string | null;
  created_at: string;
}

interface SubjectInfo {
  id: string;
  name: string;
  class_name: string;
  module: string | null;
  level: number | null;
  teacher_id: string | null;
}

// Teacher Assignment Dialog with subject management
const TeacherAssignmentDialog = memo(({ user, isAdmin, onClose, getRoleIcon }: {
  user: User;
  isAdmin: boolean;
  onClose: () => void;
  getRoleIcon: (role: string) => React.ReactNode;
}) => {
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<SubjectInfo[]>([]);
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [modules, setModules] = useState<{ name: string; level: number }[]>([]);
  const [assigning, setAssigning] = useState(false);

  const isTeacher = user.role === 'teacher';

  useEffect(() => {
    if (isTeacher && isAdmin) {
      fetchSubjectsAndModules();
    }
  }, [isTeacher, isAdmin, user.user_id]);

  const fetchSubjectsAndModules = async () => {
    const [{ data: allSubjects }, { data: modulesData }] = await Promise.all([
      supabase.from('subjects').select('*').order('name'),
      supabase.from('modules').select('name, full_name'),
    ]);

    if (allSubjects) {
      setSubjects(allSubjects as SubjectInfo[]);
      setAssignedSubjects(allSubjects.filter(s => s.teacher_id === user.user_id) as SubjectInfo[]);
      
      // Extract unique module+level combos
      const moduleSet = new Map<string, { name: string; level: number }>();
      allSubjects.forEach(s => {
        if (s.module && s.level) {
          const key = `L${s.level} ${s.module}`;
          if (!moduleSet.has(key)) moduleSet.set(key, { name: s.module, level: s.level });
        }
      });
      setModules(Array.from(moduleSet.values()));
    }
  };

  const handleAssignSubject = async (subjectId: string) => {
    setAssigning(true);
    const { error } = await supabase
      .from('subjects')
      .update({ teacher_id: user.user_id })
      .eq('id', subjectId);
    
    if (error) {
      toast.error('Failed to assign subject');
    } else {
      toast.success('Subject assigned successfully');
      fetchSubjectsAndModules();
    }
    setAssigning(false);
  };

  const handleUnassignSubject = async (subjectId: string) => {
    setAssigning(true);
    const { error } = await supabase
      .from('subjects')
      .update({ teacher_id: null })
      .eq('id', subjectId);
    
    if (error) {
      toast.error('Failed to unassign subject');
    } else {
      toast.success('Subject unassigned');
      fetchSubjectsAndModules();
    }
    setAssigning(false);
  };

  // Filter available subjects by selected module
  const availableSubjects = subjects.filter(s => {
    if (selectedModule === 'all') return s.teacher_id === null;
    const [lvl, mod] = selectedModule.split('|');
    return s.teacher_id === null && s.level === parseInt(lvl) && s.module === mod;
  });

  return (
    <Dialog open={!!user} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={user.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {user.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-lg font-bold text-foreground">{user.full_name}</h3>
              <Badge variant="outline" className="gap-1 capitalize mt-1">
                {getRoleIcon(user.role)}
                {user.role}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {isTeacher && user.teacher_mcode && (
              <div className="space-y-1 col-span-2">
                <p className="text-xs text-muted-foreground">MCode</p>
                <p className="text-sm font-mono font-bold text-primary bg-primary/5 px-2 py-1 rounded">{user.teacher_mcode}</p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Class</p>
              <p className="text-sm font-medium">{user.current_class || 'N/A'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Student Card</p>
              <p className="text-sm font-medium font-mono">{user.student_card || 'N/A'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="text-sm font-medium">{user.phone || 'N/A'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Joined</p>
              <p className="text-sm font-medium">{format(new Date(user.created_at), 'MMM dd, yyyy')}</p>
            </div>
          </div>

          {/* Teacher Subject Assignment Section */}
          {isTeacher && isAdmin && (
            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Subject Assignments
              </h4>

              {/* Currently assigned */}
              {assignedSubjects.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Currently Assigned</p>
                  <div className="flex flex-wrap gap-2">
                    {assignedSubjects.map(s => (
                      <Badge key={s.id} variant="default" className="gap-1 pr-1">
                        {s.name} ({s.class_name})
                        <button
                          onClick={() => handleUnassignSubject(s.id)}
                          className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                          disabled={assigning}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Assign new */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Assign to Module</p>
                <Select value={selectedModule} onValueChange={setSelectedModule}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select module" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modules</SelectItem>
                    {modules.map(m => (
                      <SelectItem key={`${m.level}|${m.name}`} value={`${m.level}|${m.name}`}>
                        L{m.level} {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {availableSubjects.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {availableSubjects.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 text-sm">
                      <span>{s.name} <span className="text-muted-foreground text-xs">({s.class_name})</span></span>
                      <Button size="sm" variant="outline" onClick={() => handleAssignSubject(s.id)} disabled={assigning}>
                        Assign
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {selectedModule === 'all' ? 'All subjects are assigned' : 'No available subjects in this module'}
                </p>
              )}
              
              <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                💡 Assigning a teacher to a subject in a module gives them access to that subject across all sections (A, B, etc.)
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
TeacherAssignmentDialog.displayName = 'TeacherAssignmentDialog';

export const UsersModule = memo(() => {
  const { signUp, verifyAdminCode, role: currentUserRole } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'teacher' | 'admin' | 'parent'>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'student' | 'teacher' | 'admin' | 'parent'>('student');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserClass, setNewUserClass] = useState('');
  const [newUserStudentCard, setNewUserStudentCard] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [availableClasses, setAvailableClasses] = useState<{ id: string; name: string }[]>([]);

  const isAdmin = currentUserRole === 'admin';

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });

    if (roleFilter !== 'all') {
      query = query.eq('role', roleFilter);
    }

    const { data } = await query;
    setUsers((data as User[]) || []);
    setLoading(false);
  }, [roleFilter]);

  const fetchClasses = useCallback(async () => {
    const { data } = await supabase.from('classes').select('id, name').order('name');
    if (data) setAvailableClasses(data);
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchClasses();
  }, [fetchUsers, fetchClasses]);

  const handleAddUser = useCallback(async () => {
    if (!newUserEmail || !newUserPassword || !newUserName) {
      toast.error('Email, password, and name are required');
      return;
    }

    if (newUserPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsSubmitting(true);

    try {
      if (newUserRole === 'admin') {
        if (!adminCode) {
          toast.error('Admin code is required for admin users');
          setIsSubmitting(false);
          return;
        }

        const isValidCode = await verifyAdminCode(adminCode);
        if (!isValidCode) {
          toast.error('Invalid admin security code');
          setIsSubmitting(false);
          return;
        }

        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'admin');

        if ((count || 0) >= 2) {
          toast.error('Maximum admin limit (2) reached');
          setIsSubmitting(false);
          return;
        }
      }

      const profileData: Record<string, any> = {
        role: newUserRole,
        full_name: newUserName,
        phone: newUserPhone || undefined,
      };

      if (newUserRole === 'student') {
        profileData.current_class = newUserClass || undefined;
        profileData.student_card = newUserStudentCard || undefined;
      }

      const { error } = await signUp(newUserEmail, newUserPassword, profileData);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success(`${newUserRole.charAt(0).toUpperCase() + newUserRole.slice(1)} account created. Confirmation email sent.`);
        setIsAddDialogOpen(false);
        resetForm();
        fetchUsers();
      }
    } catch (err) {
      toast.error('Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  }, [newUserEmail, newUserPassword, newUserName, newUserRole, newUserPhone, newUserClass, newUserStudentCard, adminCode, signUp, verifyAdminCode, fetchUsers]);

  const resetForm = useCallback(() => {
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserName('');
    setNewUserRole('student');
    setNewUserPhone('');
    setNewUserClass('');
    setNewUserStudentCard('');
    setAdminCode('');
  }, []);

  const filteredUsers = users.filter(user =>
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.student_card?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.current_class?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.phone?.includes(searchQuery)
  );

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'student': return <GraduationCap className="w-4 h-4" />;
      case 'teacher': return <BookOpen className="w-4 h-4" />;
      case 'admin': return <Shield className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  const stats = {
    total: users.length,
    students: users.filter(u => u.role === 'student').length,
    teachers: users.filter(u => u.role === 'teacher').length,
    admins: users.filter(u => u.role === 'admin').length,
    parents: users.filter(u => u.role === 'parent').length,
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
          <h2 className="text-2xl font-bold text-foreground">Users Management</h2>
          <p className="text-muted-foreground">View and manage all system users</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="teacher">Teacher</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="admin">Admin (requires code)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label>Password *</Label>
                <Input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Enter full name"
                />
              </div>

              <div className="space-y-2">
                <Label>Phone (optional)</Label>
                <Input
                  value={newUserPhone}
                  onChange={(e) => setNewUserPhone(e.target.value)}
                  placeholder="+1234567890"
                />
              </div>

              {newUserRole === 'student' && (
                <>
                  <div className="space-y-2">
                    <Label>Student Card ID</Label>
                    <Input
                      value={newUserStudentCard}
                      onChange={(e) => setNewUserStudentCard(e.target.value)}
                      placeholder="e.g., SC2025001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select value={newUserClass} onValueChange={setNewUserClass}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableClasses.map(c => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {newUserRole === 'admin' && (
                <div className="space-y-2">
                  <Label>Admin Security Code *</Label>
                  <Input
                    type="password"
                    value={adminCode}
                    onChange={(e) => setAdminCode(e.target.value)}
                    placeholder="Enter admin code"
                  />
                  <p className="text-xs text-muted-foreground">
                    Max 2 admins allowed
                  </p>
                </div>
              )}

              <Button 
                onClick={handleAddUser} 
                className="w-full" 
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* User Profile View Dialog with Teacher Assignment */}
      {selectedUser && (
        <TeacherAssignmentDialog 
          user={selectedUser} 
          isAdmin={isAdmin} 
          onClose={() => setSelectedUser(null)}
          getRoleIcon={getRoleIcon}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Total Users</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <GraduationCap className="w-8 h-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Students</p>
              <p className="text-2xl font-bold">{stats.students}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-accent-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Teachers</p>
              <p className="text-2xl font-bold">{stats.teachers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Parents</p>
              <p className="text-2xl font-bold">{stats.parents}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="w-8 h-8 text-destructive" />
            <div>
              <p className="text-sm text-muted-foreground">Admins</p>
              <p className="text-2xl font-bold">{stats.admins}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="student">Students</SelectItem>
            <SelectItem value="teacher">Teachers</SelectItem>
            <SelectItem value="parent">Parents</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Student Card</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Joined</TableHead>
                {isAdmin && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id} className={isAdmin ? 'cursor-pointer hover:bg-muted/50' : ''} onClick={() => isAdmin && setSelectedUser(user)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {user.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.full_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1 capitalize">
                      {getRoleIcon(user.role)}
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.current_class || '-'}</TableCell>
                  <TableCell>{user.student_card || '-'}</TableCell>
                  <TableCell>{user.phone || '-'}</TableCell>
                  <TableCell>{format(new Date(user.created_at), 'MMM dd, yyyy')}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedUser(user); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
});
UsersModule.displayName = 'UsersModule';
