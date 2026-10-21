import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MessageCircle, Send, Search, User, CheckCheck, Check, Paperclip, FileText, X, Image, Video, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface Attachment {
  name: string;
  url?: string;  // legacy public URL (older messages)
  path?: string; // private storage path (new messages — signed on demand)
  type: string;
  size: number;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
  attachments?: Attachment[];
}

interface ChatContact {
  user_id: string;
  full_name: string;
  teacher_mcode: string | null;
  avatar_url: string | null;
  role: string;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const ParentTeacherChat = () => {
  const { user, role } = useAuth();
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [selectedContact, setSelectedContact] = useState<ChatContact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [mcodeSearch, setMcodeSearch] = useState('');
  const [findDialogOpen, setFindDialogOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isParent = role === 'parent';

  useEffect(() => {
    if (!user?.id) return;
    loadContacts();
  }, [user?.id]);

  useEffect(() => {
    if (!selectedContact || !user?.id) return;
    loadMessages();

    const channel = supabase
      .channel(`chat-${user.id}-${selectedContact.user_id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'parent_messages',
      }, (payload) => {
        const msg = payload.new as Message;
        if (
          (msg.sender_id === user.id && msg.receiver_id === selectedContact.user_id) ||
          (msg.sender_id === selectedContact.user_id && msg.receiver_id === user.id)
        ) {
          setMessages(prev => [...prev, msg]);
          if (msg.receiver_id === user.id) {
            supabase.from('parent_messages').update({ is_read: true }).eq('id', msg.id).then();
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedContact, user?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadContacts = async () => {
    if (!user?.id) return;
    const { data: allMsgs } = await supabase
      .from('parent_messages')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (!allMsgs?.length) return;

    const contactIds = new Set<string>();
    allMsgs.forEach(m => {
      if (m.sender_id !== user.id) contactIds.add(m.sender_id);
      if (m.receiver_id !== user.id) contactIds.add(m.receiver_id);
    });
    if (contactIds.size === 0) return;

    const { data: profiles } = await supabase.rpc('get_public_profiles', {
      _role_filter: isParent ? 'teacher' : undefined,
    });

    if (profiles) {
      const contactProfiles = (profiles as any[]).filter(p => contactIds.has(p.user_id));
      if (isParent) {
        const { data: teacherProfiles } = await supabase
          .from('profiles')
          .select('user_id, teacher_mcode')
          .in('user_id', Array.from(contactIds));
        const mcodeMap = new Map(teacherProfiles?.map(t => [t.user_id, t.teacher_mcode]) || []);
        setContacts(contactProfiles.map(p => ({ ...p, teacher_mcode: mcodeMap.get(p.user_id) || null })));
      } else {
        setContacts(contactProfiles.map(p => ({ ...p, teacher_mcode: null })));
      }
    }
  };

  const loadMessages = async () => {
    if (!user?.id || !selectedContact) return;
    const { data } = await supabase
      .from('parent_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${selectedContact.user_id}),and(sender_id.eq.${selectedContact.user_id},receiver_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true });
    setMessages((data as unknown as Message[]) || []);

    if (data?.length) {
      const unreadIds = data.filter(m => m.receiver_id === user.id && !m.is_read).map(m => m.id);
      if (unreadIds.length > 0) {
        await supabase.from('parent_messages').update({ is_read: true }).in('id', unreadIds);
      }
    }
  };

  const handleFindTeacher = async () => {
    if (!mcodeSearch.trim()) return;
    setSearching(true);
    // Use SECURITY DEFINER RPC because parents have no direct read on profiles.
    const { data, error } = await supabase.rpc('find_teacher_by_mcode', {
      _code: mcodeSearch.trim(),
    });

    const row: any = Array.isArray(data) ? data[0] : data;

    if (!error && row) {
      const contact: ChatContact = {
        user_id: row.user_id,
        full_name: row.full_name,
        teacher_mcode: row.teacher_mcode,
        avatar_url: row.avatar_url,
        role: 'teacher',
      };
      setContacts(prev => prev.find(c => c.user_id === contact.user_id) ? prev : [...prev, contact]);
      setSelectedContact(contact);
      setFindDialogOpen(false);
      setMcodeSearch('');
      toast.success(`Found teacher: ${row.full_name}`);
    } else {
      toast.error('No teacher found with that MCode. Double-check spelling/case.');
    }
    setSearching(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid: File[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`${f.name} exceeds 100MB limit`);
        continue;
      }
      if (!ALLOWED_TYPES.includes(f.type)) {
        toast.error(`${f.name} - unsupported file type`);
        continue;
      }
      valid.push(f);
    }
    setPendingFiles(prev => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const uploadFiles = async (): Promise<Attachment[]> => {
    const attachments: Attachment[] = [];
    for (const file of pendingFiles) {
      const ext = file.name.split('.').pop();
      const path = `${user!.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('message-attachments').upload(path, file);
      if (error) {
        toast.error(`Failed to upload ${file.name}`);
        continue;
      }
      attachments.push({
        name: file.name,
        path,
        type: file.type,
        size: file.size,
      });
    }
    return attachments;
  };

  // Resolve attachment URL (signed for private bucket, falls back to legacy public url)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const ensureSignedUrl = async (att: Attachment): Promise<string | null> => {
    if (att.url && !att.path) return att.url;
    if (!att.path) return null;
    if (signedUrls[att.path]) return signedUrls[att.path];
    const { data, error } = await supabase.storage
      .from('message-attachments')
      .createSignedUrl(att.path, 60 * 10);
    if (error || !data?.signedUrl) return null;
    setSignedUrls(prev => ({ ...prev, [att.path!]: data.signedUrl }));
    return data.signedUrl;
  };

  const handleSend = async () => {
    if ((!newMessage.trim() && pendingFiles.length === 0) || !selectedContact || !user?.id) return;
    setSending(true);
    setUploading(pendingFiles.length > 0);

    let attachments: Attachment[] = [];
    if (pendingFiles.length > 0) {
      attachments = await uploadFiles();
    }

    const { error } = await supabase.from('parent_messages').insert({
      sender_id: user.id,
      receiver_id: selectedContact.user_id,
      message: newMessage.trim() || (attachments.length > 0 ? `📎 ${attachments.length} file(s)` : ''),
      attachments: attachments.length > 0 ? attachments : undefined,
    } as any);

    if (error) {
      toast.error('Failed to send message');
    } else {
      setNewMessage('');
      setPendingFiles([]);
    }
    setSending(false);
    setUploading(false);
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="h-3 w-3" />;
    if (type.startsWith('video/')) return <Video className="h-3 w-3" />;
    return <FileText className="h-3 w-3" />;
  };

  const AttachmentItem = ({ att }: { att: Attachment }) => {
    const [url, setUrl] = useState<string | null>(att.url ?? null);
    useEffect(() => {
      let cancelled = false;
      if (!url) {
        ensureSignedUrl(att).then((u) => { if (!cancelled) setUrl(u); });
      }
      return () => { cancelled = true; };
    }, [att.path]);
    if (!url) {
      return <span className="text-xs text-muted-foreground italic">Loading attachment…</span>;
    }
    if (att.type.startsWith('image/')) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt={att.name} className="max-w-[200px] max-h-40 rounded-md border border-border/50" />
        </a>
      );
    }
    if (att.type.startsWith('video/')) {
      return (
        <video controls className="max-w-[200px] max-h-40 rounded-md">
          <source src={url} type={att.type} />
        </video>
      );
    }
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs underline">
        <FileText className="h-3 w-3" /> {att.name}
      </a>
    );
  };

  const renderAttachments = (atts: Attachment[]) => (
    <div className="mt-1 space-y-1">
      {atts.map((att, i) => <AttachmentItem key={i} att={att} />)}
    </div>
  );



  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageCircle className="h-5 w-5 text-primary" />
            {isParent ? 'Message Teacher' : 'Parent Messages'}
          </CardTitle>
          {isParent && (
            <Dialog open={findDialogOpen} onOpenChange={setFindDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <Search className="h-4 w-4" /> Find by MCode
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Find Teacher by MCode</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Enter the teacher's MCode to start a private conversation.</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. MC-A3B2C1"
                      value={mcodeSearch}
                      onChange={(e) => setMcodeSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleFindTeacher()}
                      autoFocus
                    />
                    <Button onClick={handleFindTeacher} disabled={searching || !mcodeSearch.trim()}>
                      {searching ? '...' : 'Find'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex gap-3 overflow-hidden p-3">
        {/* Contact list */}
        <div className="w-1/3 border-r border-border pr-2 overflow-y-auto space-y-1">
          {contacts.length === 0 ? (
            <div className="text-center py-8">
              <User className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                {isParent ? 'Use MCode to find a teacher' : 'No messages yet'}
              </p>
            </div>
          ) : (
            contacts.map(c => (
              <div
                key={c.user_id}
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                  selectedContact?.user_id === c.user_id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'
                }`}
                onClick={() => setSelectedContact(c)}
              >
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  {c.avatar_url ? (
                    <img src={c.avatar_url} className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate text-foreground">{c.full_name}</p>
                  {c.teacher_mcode && <p className="text-[10px] text-muted-foreground">{c.teacher_mcode}</p>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {selectedContact ? (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 mb-2 pr-1">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    Start a conversation with {selectedContact.full_name}
                  </div>
                ) : (
                  messages.map(m => {
                    const isMine = m.sender_id === user?.id;
                    const atts = Array.isArray(m.attachments) ? m.attachments as Attachment[] : [];
                    return (
                      <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                          isMine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'
                        }`}>
                          {m.message && <p>{m.message}</p>}
                          {atts.length > 0 && renderAttachments(atts)}
                          <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : ''}`}>
                            <span className={`text-[10px] ${isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                              {format(new Date(m.created_at), 'HH:mm')}
                            </span>
                            {isMine && (
                              m.is_read
                                ? <CheckCheck className="h-3 w-3 text-primary-foreground/70" />
                                : <Check className="h-3 w-3 text-primary-foreground/50" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pending files preview */}
              {pendingFiles.length > 0 && (
                <div className="flex gap-1 flex-wrap mb-1">
                  {pendingFiles.map((f, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 text-xs">
                      {getFileIcon(f.type)}
                      <span className="max-w-[80px] truncate">{f.name}</span>
                      <button onClick={() => removePendingFile(i)}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button size="icon" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={sending}>
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  disabled={sending}
                  className="flex-1"
                />
                <Button size="icon" onClick={handleSend} disabled={sending || (!newMessage.trim() && pendingFiles.length === 0)}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              {isParent ? 'Select a teacher or find one by MCode' : 'Select a conversation'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ParentTeacherChat;
