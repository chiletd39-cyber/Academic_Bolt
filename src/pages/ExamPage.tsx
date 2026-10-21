/**
 * ExamPage — thin shell that wires the production exam engine to the
 * existing UI components. All lifecycle, state, autosave, submission,
 * recovery, security-event, and network logic lives in `src/exam-engine`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useExamSecurity } from '@/hooks/useExamSecurity';
import { useScreenProtection } from '@/hooks/useScreenProtection';
import { useObjectDetection } from '@/hooks/useObjectDetection';
import { SecuritySidebar, SecuritySidebarHandle } from '@/components/exam/SecuritySidebar';
import { ExamCountdown } from '@/components/exam/ExamCountdown';
import { ObjectDetectionOverlay } from '@/components/exam/ObjectDetectionOverlay';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, ChevronLeft, ChevronRight, Send, Eye, Loader2, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BroadcastListener } from '@/components/exam/BroadcastListener';
import { BroadcastPanel } from '@/components/exam/BroadcastPanel';
import { CursorDangerZone } from '@/components/exam/CursorDangerZone';
import { PermissionGate } from '@/components/exam/PermissionGate';
import { useExamEngine, clearDraft } from '@/exam-engine';
import { StructuredText } from '@/components/exam/StructuredText';

interface ExamQuestion {
  id: string;
  text: string;
  type: 'multiple_choice' | 'short_answer' | 'essay' | 'true_false';
  options?: string[];
  correctAnswer?: string | number;
  marks: number;
  number?: string;
  section?: string;
  instructions?: string;
  optionLabels?: string[];
}

export const ExamPage: React.FC = () => {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { toast } = useToast();
  const { role, profile, user } = useAuth();

  const isViewOnly = role === 'teacher' || role === 'admin';

  const [showCountdown, setShowCountdown] = useState(true);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [taskData, setTaskData] = useState<{
    duration_minutes?: number;
    max_warnings?: number;
    title?: string;
    total_marks?: number;
    required_fields?: { name?: boolean; class?: boolean; email?: boolean };
    security_settings?: Record<string, boolean>;
  } | null>(null);
  const securitySidebarRef = useRef<SecuritySidebarHandle>(null);

  // Engine — the source of truth for lifecycle, answers, submission, network.
  const durationSec = Math.max(60, (taskData?.duration_minutes ?? 60) * 60);
  const { snapshot: engine, controls } = useExamEngine({
    studentId: user?.id ?? '',
    taskId: examId ?? '',
    durationSec,
    autosaveEnabled: !isViewOnly,
  });

  // Existing security hook — kept for policy enforcement, warning UI, and
  // fullscreen re-entry. The engine's security bus receives every warning.
  const {
    state, addWarning, updateHeadPosition, updateEyeDeviation, updateSoundLevel,
    enterFullscreen, startTimer, setMaxWarnings,
  } = useExamSecurity(taskData?.max_warnings || 3);

  // Screen protection.
  const { state: screenState } = useScreenProtection({
    enabled: !isViewOnly && !showCountdown,
    onViolation: (type, message) => {
      addWarning('tab', message);
      controls.emitSecurity('external_display', message, 'critical', { type });
      toast({ title: 'Screen Protection Warning', description: message, variant: 'destructive' });
    },
  });

  // AI object detection — model loads once, engine throttles.
  const lastObjectWarningRef = useRef<number>(0);
  const objectDetection = useObjectDetection({
    enabled: !isViewOnly && !showCountdown,
    videoElement,
    detectionInterval: 3000,
    confidenceThreshold: 0.45,
    onThreatDetected: useCallback((threats: string[]) => {
      const now = Date.now();
      if (now - lastObjectWarningRef.current < 10_000) return;
      lastObjectWarningRef.current = now;
      addWarning('tab', `Object detected: ${threats.join(', ')}`);
      controls.emitSecurity('object_detected', `Object detected: ${threats.join(', ')}`, 'critical', { threats });
      toast({ title: 'Object Detection Warning', description: `Prohibited object detected: ${threats.join(', ')}`, variant: 'destructive' });
    }, [addWarning, controls, toast]),
  });

  // Poll for webcam element from the SecuritySidebar.
  useEffect(() => {
    if (showCountdown || isViewOnly) return;
    const interval = window.setInterval(() => {
      const el = securitySidebarRef.current?.getVideoElement();
      if (el && el !== videoElement) setVideoElement(el);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [showCountdown, isViewOnly, videoElement]);

  // Push warning count into the engine so autosave persists it.
  useEffect(() => { controls.setWarnings(state.warningCount); }, [state.warningCount, controls]);

  // Emit fullscreen exit events into the security bus.
  useEffect(() => {
    if (isViewOnly) return;
    const onFs = () => {
      if (!document.fullscreenElement && state.isTimerRunning && !state.isForceSubmitted) {
        controls.emitSecurity('fullscreen_exit', 'Fullscreen exited', 'critical');
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [isViewOnly, state.isTimerRunning, state.isForceSubmitted, controls]);

  // Fetch task metadata + questions (unchanged contract).
  useEffect(() => {
    const fetchTask = async () => {
      if (!examId) return;

      if (!isViewOnly && user?.id) {
        const { data: existingSub } = await supabase
          .from('task_submissions').select('id, status')
          .eq('student_id', user.id).eq('task_id', examId).limit(1);
        if (existingSub && existingSub.length > 0 && existingSub[0].status !== 'in_progress') {
          toast({ title: 'Already Submitted', description: 'You have already submitted this task. Re-attempts are not allowed.', variant: 'destructive' });
          navigate('/dashboard');
          return;
        }
      }

      const { data } = await supabase.from('tasks_safe' as never).select('*').eq('id', examId).single();
      if (data) {
        setTaskData(data as never);
        if ((data as { max_warnings?: number }).max_warnings) setMaxWarnings((data as { max_warnings: number }).max_warnings);
      }

      setLoadingQuestions(true);
      try {
        const { data: questionsData, error } = await supabase.rpc('get_exam_questions', { _task_id: examId });
        if (error) {
          toast({ title: 'Error', description: error.message || 'Failed to load exam questions', variant: 'destructive' });
          navigate('/dashboard'); return;
        }
        const parsed: ExamQuestion[] = Array.isArray(questionsData)
          ? (questionsData as unknown[]).map((raw, i) => {
              const q = raw as { id?: string; text?: string; type?: ExamQuestion['type']; options?: string[]; marks?: number; number?: string; section?: string; instructions?: string; optionLabels?: string[] };
              return { id: q.id || `q-${i}`, text: q.text || '', type: q.type || 'multiple_choice', options: q.options || [], marks: q.marks || 1, number: q.number, section: q.section, instructions: q.instructions, optionLabels: q.optionLabels };
            })
          : [];
        if (parsed.length === 0 && !isViewOnly) {
          toast({ title: 'No Questions', description: 'This exam has no questions yet.', variant: 'destructive' });
          navigate('/dashboard'); return;
        }
        setQuestions(parsed);
      } catch {
        toast({ title: 'Error', description: 'Failed to load exam. Please try again.', variant: 'destructive' });
        navigate('/dashboard'); return;
      } finally {
        setLoadingQuestions(false);
      }
    };
    fetchTask();
  }, [examId, isViewOnly, user?.id, navigate, toast, setMaxWarnings]);

  // Server said this attempt is finalized, expired or closed → never editable.
  const blockedReason = engine.recovery?.blocked ?? null;
  useEffect(() => {
    if (isViewOnly || !user?.id || !examId) return;
    if (engine.recovery?.alreadySubmitted || blockedReason) {
      clearDraft(user.id, examId);
      const msg = blockedReason === 'expired' ? 'The deadline for this exam has passed.'
        : blockedReason === 'closed' ? 'This exam has been closed.'
        : blockedReason === 'not_started' ? 'This exam has not started yet.'
        : 'This exam has already been submitted and is read-only.';
      toast({ title: 'Exam unavailable', description: msg, variant: 'destructive' });
      navigate('/dashboard');
    }
  }, [engine.recovery, blockedReason, isViewOnly, navigate, toast, user?.id, examId]);

  // Required-info gate.
  const [requiredFieldsData, setRequiredFieldsData] = useState<Record<string, string>>({});
  const [requiredFieldsFilled, setRequiredFieldsFilled] = useState(false);
  const [showRequiredFields, setShowRequiredFields] = useState(false);
  useEffect(() => {
    if (!isViewOnly && taskData?.required_fields) {
      const rf = taskData.required_fields;
      const needsFields = rf.name || rf.class || rf.email;
      if (needsFields) {
        setShowRequiredFields(true);
        const prefill: Record<string, string> = {};
        if (rf.name && profile?.full_name) prefill.name = profile.full_name;
        if (rf.class && profile?.current_class) prefill.class = profile.current_class;
        if (rf.email && user?.email) prefill.email = user.email;
        setRequiredFieldsData(prefill);
        setRequiredFieldsFilled((!rf.name || !!prefill.name) && (!rf.class || !!prefill.class) && (!rf.email || !!prefill.email));
      } else setRequiredFieldsFilled(true);
    } else setRequiredFieldsFilled(true);
  }, [taskData, isViewOnly, profile, user]);

  const handleCountdownComplete = useCallback(async () => {
    setShowCountdown(false);
    if (!isViewOnly) {
      const remaining = await controls.beginExam();
      if (remaining === null) return; // server refused — redirect effect handles it
      enterFullscreen();
      startTimer(remaining);
    }
  }, [enterFullscreen, startTimer, isViewOnly, controls]);

  const handleWarning = useCallback((type: 'head' | 'eye' | 'sound', message: string) => {
    if (isViewOnly) return;
    addWarning(type, message);
    const busType = type === 'head' ? 'head_deviation' : type === 'eye' ? 'eye_deviation' : 'sound_high';
    controls.emitSecurity(busType, message, 'warning');
    toast({ title: 'Security Warning', description: message, variant: 'destructive' });
    if (user?.id && examId) {
      supabase.functions.invoke('send-notification', {
        body: { type: 'warning', student_id: user.id, task_title: taskData?.title, warning_count: state.warningCount + 1, max_warnings: state.maxWarnings, reason: message },
      }).catch(() => { /* fire-and-forget */ });
    }
  }, [addWarning, controls, toast, isViewOnly, user?.id, examId, taskData?.title, state.warningCount, state.maxWarnings]);

  const answersLocked = isViewOnly || !!blockedReason || ['submitted', 'force_submitted', 'expired', 'failed', 'terminated', 'submitting'].includes(engine.state);
  const handleAnswerChange = (questionId: string, value: string | number) => {
    if (answersLocked) return;
    controls.setAnswer(questionId, value);
  };

  // Force-submit driven by exam-security hook (time/warnings).
  useEffect(() => {
    if (isViewOnly || !state.isForceSubmitted) return;
    void controls.forceSubmit(state.remainingTime === 0 ? 'time_expired' : 'max_warnings');
    supabase.functions.invoke('send-notification', {
      body: { type: 'force_submit', student_id: user?.id, task_title: taskData?.title, reason: state.remainingTime === 0 ? 'Time expired' : `Exceeded maximum warnings (${state.maxWarnings})` },
    }).catch(() => { /* fire-and-forget */ });
  }, [state.isForceSubmitted, state.remainingTime, state.maxWarnings, isViewOnly, controls, user?.id, taskData?.title]);

  const handleSubmit = async () => {
    if (isViewOnly) { navigate('/dashboard'); return; }
    const result = await controls.submit();
    if (!result) {
      toast({ title: 'Submission Error', description: engine.lastError?.actionable ?? 'Failed to submit exam. Please try again.', variant: 'destructive' });
      return;
    }
    if (user?.id && examId) clearDraft(user.id, examId);
    supabase.functions.invoke('send-notification', {
      body: { type: 'exam_ended', student_id: user?.id, task_title: taskData?.title },
    }).catch(() => { /* fire-and-forget */ });
    toast({ title: 'Exam Submitted', description: 'Your exam has been submitted successfully.' });
    navigate('/dashboard');
  };

  const progress = questions.length > 0 ? ((currentQuestion + 1) / questions.length) * 100 : 0;
  const question = questions[currentQuestion];

  // Terminal — force-submitted takeover.
  if (!isViewOnly && (engine.state === 'force_submitted' || (state.isForceSubmitted && engine.state === 'submitted'))) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-destructive/10 backdrop-blur-sm">
        <Card className="max-w-md mx-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Exam Force Submitted
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Your exam has been automatically submitted due to {state.remainingTime === 0 ? 'time expiration' : 'multiple security violations'}.
            </p>
            <Button onClick={() => navigate('/dashboard')} className="w-full">Return to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Permissions.
  if (!isViewOnly && !permissionsGranted && taskData) {
    const sec = taskData.security_settings || {};
    const needsCam = sec.webcam !== false;
    const needsMic = sec.microphone !== false;
    const needsScreen = sec.screenProtection !== false;
    if (needsCam || needsMic || needsScreen) {
      return (
        <PermissionGate
          needsCamera={needsCam} needsMic={needsMic} needsScreen={needsScreen}
          onAllGranted={() => { setPermissionsGranted(true); controls.permissionsGranted(); }}
        />
      );
    }
  }

  if (showCountdown) return <ExamCountdown onComplete={handleCountdownComplete} />;

  if (loadingQuestions) {
    return (
      <div className="flex items-center justify-center h-dvh bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading exam questions...</p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-dvh bg-background">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <AlertTriangle className="w-10 h-10 mx-auto text-warning" />
            <p className="text-foreground font-medium">No questions available</p>
            <p className="text-sm text-muted-foreground">This exam doesn't have any questions yet.</p>
            <Button onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const answers = engine.answers;

  const renderQuestion = (q: ExamQuestion) => {
    switch (q.type) {
      case 'multiple_choice':
        return (
          <RadioGroup value={answers[q.id]?.toString() || ''} onValueChange={(v) => handleAnswerChange(q.id, parseInt(v))} disabled={answersLocked}>
            {(q.options || []).map((option, index) => (
              <div key={index} className={`flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors ${isViewOnly ? 'opacity-75 cursor-not-allowed' : ''}`}>
                <RadioGroupItem value={index.toString()} id={`option-${q.id}-${index}`} disabled={answersLocked} />
                <Label htmlFor={`option-${q.id}-${index}`} className={`flex-1 whitespace-pre-wrap ${isViewOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}>{q.optionLabels?.[index] ? `${q.optionLabels[index]}. ` : ''}{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );
      case 'true_false':
        return (
          <RadioGroup value={answers[q.id]?.toString() || ''} onValueChange={(v) => handleAnswerChange(q.id, parseInt(v))} disabled={answersLocked}>
            {['True', 'False'].map((option, index) => (
              <div key={index} className={`flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors ${isViewOnly ? 'opacity-75 cursor-not-allowed' : ''}`}>
                <RadioGroupItem value={index.toString()} id={`tf-${q.id}-${index}`} disabled={answersLocked} />
                <Label htmlFor={`tf-${q.id}-${index}`} className={`flex-1 ${isViewOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}>{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );
      case 'short_answer':
        return <Input placeholder="Type your answer here..." value={(answers[q.id] as string) || ''} onChange={(e) => handleAnswerChange(q.id, e.target.value)} disabled={answersLocked} className="h-12" />;
      case 'essay':
        return <Textarea placeholder="Write your answer here..." value={(answers[q.id] as string) || ''} onChange={(e) => handleAnswerChange(q.id, e.target.value)} disabled={answersLocked} className="min-h-[150px]" />;
      default:
        return <p className="text-muted-foreground">Unsupported question type</p>;
    }
  };

  return (
    <div className="flex h-dvh bg-background select-none" onContextMenu={(e) => e.preventDefault()}>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold">{taskData?.title || 'Examination'}</h1>
            {isViewOnly && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-warning/20 text-warning-foreground border border-warning/30">
                <Eye className="w-3 h-3" /> View Only
              </span>
            )}
            {engine.network !== 'online' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-destructive/20 text-destructive border border-destructive/30">
                <WifiOff className="w-3 h-3" /> {engine.network === 'reconnecting' ? 'Reconnecting…' : 'Offline'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Question {currentQuestion + 1} of {questions.length}</span>
            <Progress value={progress} className="w-32 h-2" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto">
            {showRequiredFields && !requiredFieldsFilled && !isViewOnly && (
              <Card className="mb-6 border-primary/50">
                <CardHeader><CardTitle className="text-lg">Required Information</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {taskData?.required_fields?.name && (
                    <div className="space-y-1"><Label>Full Name *</Label>
                      <Input value={requiredFieldsData.name || ''} onChange={(e) => setRequiredFieldsData(p => ({ ...p, name: e.target.value }))} placeholder="Enter your full name" disabled={!!profile?.full_name} /></div>
                  )}
                  {taskData?.required_fields?.class && (
                    <div className="space-y-1"><Label>Class *</Label>
                      <Input value={requiredFieldsData.class || ''} onChange={(e) => setRequiredFieldsData(p => ({ ...p, class: e.target.value }))} placeholder="Enter your class" disabled={!!profile?.current_class} /></div>
                  )}
                  {taskData?.required_fields?.email && (
                    <div className="space-y-1"><Label>Email *</Label>
                      <Input value={requiredFieldsData.email || ''} onChange={(e) => setRequiredFieldsData(p => ({ ...p, email: e.target.value }))} placeholder="Enter your email" type="email" disabled={!!user?.email} /></div>
                  )}
                  <Button onClick={() => {
                    const rf = taskData?.required_fields;
                    const valid = (!rf?.name || requiredFieldsData.name?.trim()) && (!rf?.class || requiredFieldsData.class?.trim()) && (!rf?.email || requiredFieldsData.email?.trim());
                    if (valid) setRequiredFieldsFilled(true);
                    else toast({ title: 'Missing Fields', description: 'Please fill all required fields', variant: 'destructive' });
                  }}>Continue to Exam</Button>
                </CardContent>
              </Card>
            )}

            {requiredFieldsFilled && question && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-medium">Question {question.number ?? currentQuestion + 1}</CardTitle>
                    <span className="text-sm text-muted-foreground">{question.marks} mark{question.marks > 1 ? 's' : ''}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {question.section && (currentQuestion === 0 || questions[currentQuestion - 1]?.section !== question.section) && (
                    <p className="font-semibold text-primary">{question.section}</p>
                  )}
                  {question.instructions && <p className="text-sm italic text-muted-foreground whitespace-pre-wrap">{question.instructions}</p>}
                  <StructuredText text={question.text} className="text-lg" />
                  {renderQuestion(question)}
                  {isViewOnly && (
                    <p className="text-sm text-muted-foreground italic mt-4">Teachers and admins can view questions but cannot submit answers.</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="h-16 border-t border-border flex items-center justify-between px-6 bg-card">
          <Button variant="outline" onClick={() => setCurrentQuestion(p => Math.max(0, p - 1))} disabled={currentQuestion === 0}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <div className="flex gap-2 flex-wrap justify-center max-w-[50%]">
            {questions.map((q, index) => (
              <button key={q.id} onClick={() => setCurrentQuestion(index)}
                className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  index === currentQuestion ? 'bg-primary text-primary-foreground'
                    : answers[q.id] !== undefined ? 'bg-success/20 text-success border border-success'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}>{index + 1}</button>
            ))}
          </div>
          {currentQuestion === questions.length - 1 ? (
            <Button onClick={() => setShowSubmitDialog(true)} disabled={engine.submitting}>
              {engine.submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {isViewOnly ? 'Exit Preview' : engine.submitting ? 'Submitting…' : 'Submit Exam'}
              {!engine.submitting && <Send className="w-4 h-4 ml-1" />}
            </Button>
          ) : (
            <Button onClick={() => setCurrentQuestion(p => Math.min(questions.length - 1, p + 1))}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>

      {!isViewOnly && <BroadcastListener taskId={examId} />}

      {isViewOnly && (
        <div className="w-80 h-full bg-card border-l border-border flex flex-col p-4">
          <BroadcastPanel taskId={examId} />
        </div>
      )}

      {!isViewOnly && (
        <SecuritySidebar
          ref={securitySidebarRef}
          warningCount={state.warningCount}
          maxWarnings={state.maxWarnings}
          remainingTime={state.remainingTime}
          studentToken={state.studentToken}
          screenProtection={{
            isExternalDisplayDetected: screenState.isExternalDisplayDetected,
            isScreenSharing: screenState.isScreenSharing,
            isPictureInPicture: screenState.isPictureInPicture,
            displayCount: screenState.displayCount,
          }}
          onHeadMovement={updateHeadPosition}
          onEyeDeviation={updateEyeDeviation}
          onSoundLevel={updateSoundLevel}
          onWarning={handleWarning}
        />
      )}

      {!isViewOnly && !showCountdown && (
        <CursorDangerZone onWarning={(msg) => handleWarning('eye', msg)} />
      )}

      {!isViewOnly && (
        <ObjectDetectionOverlay threats={objectDetection.detectedThreats} visible={objectDetection.threatDetected} />
      )}

      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isViewOnly ? 'Exit Preview?' : 'Submit Examination?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isViewOnly
                ? 'You are viewing this exam as a teacher/admin. Click confirm to return to dashboard.'
                : `You have answered ${Object.keys(answers).length} of ${questions.length} questions. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isViewOnly ? 'Continue Viewing' : 'Continue Exam'}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={engine.submitting}>
              {engine.submitting ? 'Submitting…' : isViewOnly ? 'Exit' : 'Submit'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExamPage;
