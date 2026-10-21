import React, { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Camera, Loader2, Save, User, ArrowRightLeft, Download, Trash2, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { ClassSwitcher } from '@/components/dashboard/ClassSwitcher';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { revokeDeviceTrust } from '@/lib/mfaDevice';

interface ProfileEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProfileEditor: React.FC<ProfileEditorProps> = ({ open, onOpenChange }) => {
  const { profile, updateProfile, uploadAvatar, signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [currentClass, setCurrentClass] = useState(profile?.current_class || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const { data } = await supabase.auth.mfa.listFactors();
        setMfaEnabled(!!data?.totp?.some(f => f.status === 'verified'));
      } catch { setMfaEnabled(false); }
    })();
  }, [open]);

  const handleEnableMfa = () => {
    onOpenChange(false);
    navigate('/mfa?setup=1');
  };

  const handleDisableMfa = async () => {
    setMfaBusy(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of data?.totp ?? []) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      if (profile?.user_id) revokeDeviceTrust(profile.user_id);
      setMfaEnabled(false);
      toast.success('Two-factor authentication disabled');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to disable 2FA');
    } finally { setMfaBusy(false); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-my-data');
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `my-data-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Your data has been downloaded');
    } catch (e: any) {
      toast.error(e?.message || 'Export failed');
    } finally { setExporting(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      toast.success('Account permanently deleted');
      await signOut();
      window.location.href = '/';
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete account');
      setDeleting(false);
    }
  };


  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    setIsLoading(true);
    const { url, error } = await uploadAvatar(file);
    
    if (error) {
      toast.error('Failed to upload avatar');
      setAvatarPreview(null);
    } else if (url) {
      await updateProfile({ avatar_url: url });
      toast.success('Avatar updated!');
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsLoading(true);
    
    // Students cannot change their own class
    const updates: Record<string, string> = {
      full_name: fullName,
      phone,
    };
    
    // Only non-students can update class
    if (profile?.role !== 'student') {
      updates.current_class = currentClass;
    }

    const { error } = await updateProfile(updates);

    if (error) {
      toast.error('Failed to update profile');
    } else {
      toast.success('Profile updated successfully!');
      onOpenChange(false);
    }
    
    setIsLoading(false);
  };

  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        
        {profile?.role === 'student' ? (
          <Tabs defaultValue="profile">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="profile" className="gap-1">
                <User className="h-3 w-3" /> Profile
              </TabsTrigger>
              <TabsTrigger value="class" className="gap-1">
                <ArrowRightLeft className="h-3 w-3" /> Class & History
              </TabsTrigger>
            </TabsList>
            <TabsContent value="profile" className="space-y-6 mt-4">
              {renderProfileForm()}
            </TabsContent>
            <TabsContent value="class" className="mt-4">
              <ClassSwitcher />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-6">
            {renderProfileForm()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  function renderProfileForm() {
    return (
      <>
        {/* Avatar */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar className="w-24 h-24">
              <AvatarImage src={avatarPreview || profile?.avatar_url || ''} />
              <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
          <p className="text-xs text-muted-foreground">Click camera to change photo</p>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          <div>
            <Label>Full Name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div>
            <Label>Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+250 xxx xxx xxx"
            />
          </div>

          {profile?.role === 'student' && (
            <div>
              <Label>Class</Label>
              <Input
                value={profile?.current_class || ''}
                disabled
                className="bg-muted"
                placeholder="Assigned by admin"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use the "Class & History" tab to request a class switch.
              </p>
            </div>
          )}

          <div>
            <Label>Role</Label>
            <Input
              value={profile?.role?.toUpperCase() || ''}
              disabled
              className="bg-muted"
            />
          </div>

          {profile?.role === 'teacher' && (
            <div>
              <Label>Teacher MCode</Label>
              <Input
                value={(profile as any)?.teacher_mcode || 'Generating...'}
                disabled
                className="bg-muted font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Share this code with parents so they can send you direct messages.
              </p>
            </div>
          )}

          <div>
            <Label>Student Card</Label>
            <Input
              value={profile?.student_card || 'N/A'}
              disabled
              className="bg-muted"
            />
          </div>
        </div>

        {/* Security / 2FA */}
        <div className="rounded-md border border-border/60 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="w-4 h-4 text-primary" /> Two-factor authentication
          </div>
          <p className="text-xs text-muted-foreground">
            {mfaEnabled
              ? 'Enabled. New devices will be asked for a 6-digit code. Trusted devices are remembered for 30 days.'
              : 'Optional. Protect your account by requiring a 6-digit code on new devices.'}
          </p>
          {mfaEnabled ? (
            <Button variant="outline" size="sm" onClick={handleDisableMfa} disabled={mfaBusy}>
              {mfaBusy ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <ShieldOff className="w-3 h-3 mr-2" />}
              Disable 2FA
            </Button>
          ) : (
            <Button size="sm" onClick={handleEnableMfa} disabled={mfaEnabled === null}>
              <ShieldCheck className="w-3 h-3 mr-2" /> Enable 2FA
            </Button>
          )}
        </div>


        {/* Privacy controls */}
        <div className="rounded-md border border-border/60 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="w-4 h-4 text-primary" /> Privacy & data
          </div>
          <p className="text-xs text-muted-foreground">
            Download a copy of your data or permanently delete your account. See <a href="/privacy" className="underline">retention policy</a>.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="flex-1">
              {exporting ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Download className="w-3 h-3 mr-2" />}
              Download my data
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleting} className="flex-1">
              <Trash2 className="w-3 h-3 mr-2" /> Delete account
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="flex-1" disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </div>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. Your profile, submissions, scores, and notifications will be erased. An administrator will be notified.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Yes, delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }
};