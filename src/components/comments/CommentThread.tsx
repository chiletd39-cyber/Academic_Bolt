import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageCircle, Send, ChevronDown, ChevronUp, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Comment {
  id: string;
  content: string;
  visibility: string;
  created_at: string;
  author_id: string;
  author_name?: string;
  author_role?: string;
}

interface CommentThreadProps {
  parentType: 'class_post' | 'task';
  parentId: string;
  compact?: boolean;
}

const MAX_PREVIEW_LENGTH = 120;

// Visibility hierarchy: admin > teacher > student > public
const VISIBILITY_HIERARCHY: Record<string, string[]> = {
  admin: ['admin', 'teacher', 'student', 'public'],
  teacher: ['teacher', 'student', 'public'],
  student: ['student', 'public'],
  parent: ['public'],
};

const canSeeComment = (userRole: string, commentVisibility: string): boolean => {
  const allowed = VISIBILITY_HIERARCHY[userRole] || ['public'];
  return allowed.includes(commentVisibility);
};

export const CommentThread: React.FC<CommentThreadProps> = ({ parentType, parentId, compact = false }) => {
  const { user, role } = useAuth();
  const [allComments, setAllComments] = useState<Comment[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  useEffect(() => {
    fetchCommentCount();
  }, [parentId]);

  useEffect(() => {
    if (isOpen) fetchComments();
  }, [isOpen, parentId]);

  const fetchCommentCount = async () => {
    const { count } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('parent_type', parentType)
      .eq('parent_id', parentId);
    setCommentCount(count || 0);
  };

  const fetchComments = async () => {
    setIsLoading(true);
    // Fetch ALL comments (RLS handles base access, but we want to show blurred ones too)
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('parent_type', parentType)
      .eq('parent_id', parentId)
      .order('created_at', { ascending: true });

    if (data) {
      const authorIds = [...new Set(data.map(c => c.author_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, role')
        .in('user_id', authorIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      setAllComments(data.map(c => ({
        ...c,
        author_name: profileMap.get(c.author_id)?.full_name || 'Unknown',
        author_role: profileMap.get(c.author_id)?.role || 'student',
      })));
    }
    setIsLoading(false);
  };

  const handleSubmit = async () => {
    if (!newComment.trim() || !user?.id) return;

    const { error } = await supabase.from('comments').insert({
      parent_type: parentType,
      parent_id: parentId,
      author_id: user.id,
      content: newComment.trim(),
      visibility,
    });

    if (error) {
      toast.error('Failed to post comment');
    } else {
      setNewComment('');
      fetchComments();
      fetchCommentCount();
    }
  };

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) {
      toast.error('Failed to delete comment');
    } else {
      setAllComments(prev => prev.filter(c => c.id !== commentId));
      setCommentCount(prev => prev - 1);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const visibilityColor = (v: string) => {
    switch (v) {
      case 'admin': return 'destructive';
      case 'teacher': return 'default';
      case 'student': return 'secondary';
      default: return 'outline';
    }
  };

  const userRole = role || 'student';

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        <span>{commentCount} comment{commentCount !== 1 ? 's' : ''}</span>
        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3 pl-2 border-l-2 border-border">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            </div>
          ) : allComments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No comments yet. Be the first!</p>
          ) : (
            allComments.map((comment) => {
              const hasAccess = canSeeComment(userRole, comment.visibility);
              const isOwn = comment.author_id === user?.id;
              const canView = hasAccess || isOwn;
              const isLong = comment.content.length > MAX_PREVIEW_LENGTH;
              const isExpanded = expandedComments.has(comment.id);

              const displayContent = canView
                ? (isLong && !isExpanded
                    ? comment.content.slice(0, MAX_PREVIEW_LENGTH) + '...'
                    : comment.content)
                : '';

              return (
                <div
                  key={comment.id}
                  className={cn(
                    'p-2.5 rounded-lg space-y-1 relative',
                    canView ? 'bg-muted/40' : 'bg-muted/20'
                  )}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      'text-xs font-medium',
                      canView ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {canView ? comment.author_name : 'Hidden User'}
                    </span>
                    <Badge variant={visibilityColor(comment.visibility)} className="text-[10px] px-1.5 py-0">
                      {comment.visibility}
                    </Badge>
                    {canView && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {comment.author_role}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(comment.created_at).toLocaleString()}
                    </span>
                  </div>

                  {canView ? (
                    <>
                      <p className="text-sm text-foreground">{displayContent}</p>
                      <div className="flex items-center gap-2">
                        {isLong && (
                          <button
                            onClick={() => toggleExpand(comment.id)}
                            className="text-xs text-primary hover:underline"
                          >
                            {isExpanded ? 'Show less' : 'Read more'}
                          </button>
                        )}
                        {(isOwn || role === 'admin') && (
                          <button
                            onClick={() => handleDelete(comment.id)}
                            className="text-xs text-destructive hover:underline ml-auto flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="relative">
                      {/* Blurred content placeholder */}
                      <p className="text-sm text-foreground select-none blur-sm pointer-events-none" aria-hidden>
                        This comment content is restricted and cannot be viewed by your current role.
                      </p>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                          <Lock className="w-3 h-3" />
                          For {comment.visibility} only
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* New comment input */}
          {user && (
            <div className="space-y-2">
              <Textarea
                placeholder="Write a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="min-h-[50px] text-sm"
              />
              <div className="flex items-center gap-2">
                <Select value={visibility} onValueChange={setVisibility}>
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="student">Students+</SelectItem>
                    <SelectItem value="teacher">Teachers+</SelectItem>
                    {role === 'admin' && <SelectItem value="admin">Admin only</SelectItem>}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleSubmit} disabled={!newComment.trim()} className="h-8 gap-1">
                  <Send className="w-3 h-3" /> Post
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
