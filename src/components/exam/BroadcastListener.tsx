import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Volume2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BroadcastMessage {
  id: string;
  message: string;
  sender_name?: string;
  created_at: string;
}

interface BroadcastListenerProps {
  taskId?: string;
  className?: string;
}

export const BroadcastListener: React.FC<BroadcastListenerProps> = ({ taskId, className }) => {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [showMessage, setShowMessage] = useState(false);
  const [currentMessage, setCurrentMessage] = useState<BroadcastMessage | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.id || !profile?.current_class) return;

    const channel = supabase
      .channel('broadcast-listener')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'broadcast_messages',
        },
        (payload) => {
          const msg = payload.new as any;
          // Show if targeted to this student's class or directly to this student
          if (
            (msg.broadcast_type === 'class' && msg.class_name === profile.current_class) ||
            (msg.broadcast_type === 'individual' && msg.target_student_id === user.id)
          ) {
            const broadcastMsg: BroadcastMessage = {
              id: msg.id,
              message: msg.message,
              created_at: msg.created_at,
            };
            setCurrentMessage(broadcastMsg);
            setShowMessage(true);
            setMessages(prev => [broadcastMsg, ...prev].slice(0, 10));

            // Auto-hide after 8 seconds
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => setShowMessage(false), 8000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [user?.id, profile?.current_class]);

  if (!showMessage || !currentMessage) return null;

  return (
    <div className={cn(
      'fixed top-4 left-1/2 -translate-x-1/2 z-[100] max-w-lg w-full mx-4',
      'animate-in slide-in-from-top-4 fade-in duration-300',
      className
    )}>
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
          <Volume2 className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium opacity-80 mb-1">📢 Broadcast from Teacher</p>
          <p className="text-sm font-medium">{currentMessage.message}</p>
        </div>
        <button
          onClick={() => setShowMessage(false)}
          className="p-1 rounded-full hover:bg-primary-foreground/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};