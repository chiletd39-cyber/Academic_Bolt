import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveClass } from '@/contexts/ActiveClassContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bell, Megaphone, Send, X, Paperclip, FileText, Image, Video, File, Loader2, Check, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface PendingRequest {
  id: string;
  type: string;
  title: string;
  description: string;
  created_at: string;
  status: string;
}

interface Attachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

interface AnnouncementPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AnnouncementPanel = ({ open, onOpenChange }: AnnouncementPanelProps) => {
  const { user, role } = useAuth();
  const { activeClass, classes } = useActiveClass();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState('requests');
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Announce state
  const [announceText, setAnnounceText] = useState('');
  const [targetClass, setTargetClass] = useState('active');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      fetchRequests();
    }
  }, [open]);

  const fetchRequests = async () => {
    setLoadingRequests(true);
    const items: PendingRequest[] = [];

    // Fetch class switch requests (pending)
    const { data: switchReqs } = await supabase
      .from('class_switch_requests')
      .select('id, student_name, from_class, to_class, created_at, status')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20);

    (switchReqs || []).forEach(r => {
      items.push({
        id: r.id,
        type: 'class_switch',
        title: `${r.student_name} — Class Switch`,
        description: `${r.from_class || 'None'} → ${r.to_class}`,
        created_at: r.created_at,
        status: r.status || 'pending',
      });
    });

    // Fetch pending parent verifications
    const { data: parentReqs } = await supabase
      .from('parent_children')
      .select('id, parent_id, student_id, created_at, verified')
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(20);

    (parentReqs || []).forEach(r => {
      items.push({
        id: r.id,
        type: 'parent_verify',
        title: 'Parent Verification Request',
        description: `Parent requesting child access`,
        created_at: r.created_at,
        status: 'pending',
      });
    });

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setRequests(items);
    setLoadingRequests(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;

    setUploading(true);
    const newAttachments: Attachment[] = [];

    for (let i = 0; i < Math.min(files.length, 5); i++) {
      const file = files[i];
      if (file.size > 104857600) {
        toast.error(`${file.name} exceeds 100MB limit`);
        continue;
      }

      const ext = file.name.split('.').pop();
      const path = `${user.id}/${Date.now()}_${i}.${ext}`;

      const { error } = await supabase.storage
        .from('announcements')
        .upload(path, file);

      if (error) {
        toast.error(`Failed to upload ${file.name}`);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from('announcements')
        .getPublicUrl(path);

      newAttachments.push({
        name: file.name,
        url: urlData.publicUrl,
        type: file.type,
        size: file.size,
      });
    }

    setAttachments(prev => [...prev, ...newAttachments]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendAnnouncement = async () => {
    if (!announceText.trim() && attachments.length === 0) {
      toast.error('Please add text or attachments');
      return;
    }
    if (!user) return;

    setSending(true);

    if (targetClass === 'all') {
      // Send to all classes
      const inserts = classes.map(cls => ({
        author_id: user.id,
        class_name: cls,
        content: announceText.trim(),
        post_type: 'announcement' as const,
        visibility: 'public' as const,
        attachments: attachments.length > 0 ? (attachments as any) : [],
        target_class: 'all',
      }));

      const { error } = await supabase.from('class_posts').insert(inserts);

      if (error) {
        toast.error('Failed to send announcement');
      } else {
        toast.success(`Announcement sent to all ${classes.length} classes!`);
        setAnnounceText('');
        setAttachments([]);
        setTargetClass('active');
        onOpenChange(false);
      }
    } else {
      const className = targetClass === 'active' ? activeClass : targetClass;

      const { error } = await supabase.from('class_posts').insert([{
        author_id: user.id,
        class_name: className,
        content: announceText.trim(),
        post_type: 'announcement',
        visibility: 'public',
        attachments: attachments.length > 0 ? (attachments as any) : [],
        target_class: className,
      }]);

      if (error) {
        toast.error('Failed to send announcement');
      } else {
        toast.success(`Announcement sent to ${className}!`);
        setAnnounceText('');
        setAttachments([]);
        setTargetClass('active');
        onOpenChange(false);
      }
    }

    setSending(false);
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (type.startsWith('video/')) return <Video className="w-4 h-4" />;
    if (type.includes('pdf')) return <FileText className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / 1048576).toFixed(1)}MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notices & Announcements
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="requests" className="gap-1">
              <Clock className="w-3.5 h-3.5" />
              Requests
              {requests.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">{requests.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="announce" className="gap-1">
              <Megaphone className="w-3.5 h-3.5" />
              Announce
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-[400px]">
              {loadingRequests ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : requests.length === 0 ? (
                <div className="text-center py-12">
                  <Check className="w-10 h-10 mx-auto text-muted-foreground/50" />
                  <p className="mt-3 text-muted-foreground text-sm">No pending requests</p>
                </div>
              ) : (
                <div className="space-y-2 pr-2">
                  {requests.map((req) => (
                    <div key={req.id} className="p-3 rounded-lg border border-border">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{req.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{req.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(req.created_at), 'dd MMM yyyy, HH:mm')}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-xs shrink-0 capitalize">{req.type.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="announce" className="flex-1 overflow-hidden mt-3">
            <div className="space-y-4">
              <div>
                <Label>Target Class</Label>
                <Select value={targetClass} onValueChange={setTargetClass}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active Class ({activeClass || 'none'})</SelectItem>
                    <SelectItem value="all">📢 All Classes</SelectItem>
                    {classes.map(cls => (
                      <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Message</Label>
                <Textarea
                  value={announceText}
                  onChange={(e) => setAnnounceText(e.target.value)}
                  placeholder="Write your announcement or note..."
                  className="mt-1 min-h-[100px]"
                />
              </div>

              {/* Attachments */}
              {attachments.length > 0 && (
                <div className="space-y-2">
                  <Label>Attachments</Label>
                  {attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border">
                      {getFileIcon(att.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{att.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatSize(att.size)}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeAttachment(i)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || attachments.length >= 5}
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                  {uploading ? 'Uploading...' : 'Attach Files'}
                </Button>
                <span className="text-xs text-muted-foreground">{attachments.length}/5 files • Max 100MB each</span>
              </div>

              <Button
                onClick={handleSendAnnouncement}
                className="w-full gap-2"
                disabled={sending || (!announceText.trim() && attachments.length === 0)}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Announcement
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
