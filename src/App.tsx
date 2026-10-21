import { Suspense, memo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { NetworkStatusBanner } from "@/components/NetworkStatusBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OrientationGate } from "@/components/OrientationGate";

// Eagerly import core dashboard components to eliminate loading spinners
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { DashboardHome } from "@/components/dashboard/DashboardHome";

// Only lazy-load rarely visited heavy modules
import { lazy } from "react";
const RankModule = lazy(() => import("@/components/dashboard/RankModule").then(m => ({ default: m.RankModule })));
const PeopleModule = lazy(() => import("@/components/dashboard/PeopleModule").then(m => ({ default: m.PeopleModule })));
const HistoryModule = lazy(() => import("@/components/dashboard/HistoryModule").then(m => ({ default: m.HistoryModule })));
const LiveMonitorCombined = lazy(() => import("@/components/dashboard/LiveMonitorCombined").then(m => ({ default: m.LiveMonitorCombined })));
const TasksModule = lazy(() => import("@/components/dashboard/TasksModule").then(m => ({ default: m.TasksModule })));
const UsersModule = lazy(() => import("@/components/dashboard/UsersModule").then(m => ({ default: m.UsersModule })));
const ClassesModule = lazy(() => import("@/components/dashboard/ClassesModule").then(m => ({ default: m.ClassesModule })));
const ReportsAnalyticsCombined = lazy(() => import("@/components/dashboard/ReportsAnalyticsCombined").then(m => ({ default: m.ReportsAnalyticsCombined })));
const TermTasksCombined = lazy(() => import("@/components/dashboard/TermTasksCombined").then(m => ({ default: m.TermTasksCombined })));
const TermAndSubjects = lazy(() => import("@/components/dashboard/TermAndSubjects").then(m => ({ default: m.TermAndSubjects })));
const ParentAndIDCard = lazy(() => import("@/components/dashboard/ParentAndIDCard").then(m => ({ default: m.ParentAndIDCard })));
const ExamPage = lazy(() => import("@/pages/ExamPage").then(m => ({ default: m.ExamPage })));
const ParentTeacherChat = lazy(() => import("@/components/dashboard/ParentTeacherChat").then(m => ({ default: m.ParentTeacherChat })));
const GradingSheet = lazy(() => import("@/components/dashboard/GradingSheet").then(m => ({ default: m.GradingSheet })));
const MeetingsModule = lazy(() => import("@/components/dashboard/MeetingsModule").then(m => ({ default: m.MeetingsModule })));
const LiveEventsModule = lazy(() => import("@/components/dashboard/LiveEventsModule").then(m => ({ default: m.LiveEventsModule })));
const LiveAnalyticsModule = lazy(() => import("@/components/dashboard/LiveAnalyticsModule").then(m => ({ default: m.LiveAnalyticsModule })));
const AuditTrailModule = lazy(() => import("@/components/dashboard/AuditTrailModule").then(m => ({ default: m.AuditTrailModule })));
const AnnouncementsModule = lazy(() => import("@/components/dashboard/AnnouncementsModule").then(m => ({ default: m.AnnouncementsModule })));
const MfaPage = lazy(() => import("@/pages/MfaPage"));
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage"));
const BroadcastPage = lazy(() => import("@/pages/BroadcastPage"));
// Invisible loader - no spinner, just empty space briefly

const MiniLoader = memo(() => <div className="h-32" />);
MiniLoader.displayName = 'MiniLoader';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 10,
      gcTime: 1000 * 60 * 60,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <NetworkStatusBanner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              {/* Dashboard home loads instantly - no lazy */}
              <Route index element={<DashboardHome />} />
              <Route path="rank" element={<Suspense fallback={<MiniLoader />}><RankModule /></Suspense>} />
              <Route path="people" element={<Suspense fallback={<MiniLoader />}><PeopleModule /></Suspense>} />
              <Route path="history" element={<Suspense fallback={<MiniLoader />}><HistoryModule /></Suspense>} />
              <Route path="live" element={<Suspense fallback={<MiniLoader />}><LiveMonitorCombined /></Suspense>} />
              <Route path="tasks" element={<Suspense fallback={<MiniLoader />}><TasksModule /></Suspense>} />
              <Route path="users" element={<Suspense fallback={<MiniLoader />}><UsersModule /></Suspense>} />
              <Route path="classes" element={<Suspense fallback={<MiniLoader />}><ClassesModule /></Suspense>} />
              <Route path="reports-analytics" element={<Suspense fallback={<MiniLoader />}><ReportsAnalyticsCombined /></Suspense>} />
              <Route path="term-tasks" element={<Suspense fallback={<MiniLoader />}><TermTasksCombined /></Suspense>} />
              <Route path="terms" element={<Suspense fallback={<MiniLoader />}><TermAndSubjects /></Suspense>} />
              <Route path="reports" element={<Suspense fallback={<MiniLoader />}><ReportsAnalyticsCombined /></Suspense>} />
              <Route path="analytics" element={<Suspense fallback={<MiniLoader />}><ReportsAnalyticsCombined /></Suspense>} />
              <Route path="parent-id" element={<Suspense fallback={<MiniLoader />}><ParentAndIDCard /></Suspense>} />
              <Route path="parent-announcements" element={<DashboardHome />} />
              <Route path="parent-history" element={<DashboardHome />} />
              <Route path="messages" element={<Suspense fallback={<MiniLoader />}><ParentTeacherChat /></Suspense>} />
              <Route path="grading" element={<Suspense fallback={<MiniLoader />}><GradingSheet /></Suspense>} />
              <Route path="meetings" element={<Suspense fallback={<MiniLoader />}><MeetingsModule /></Suspense>} />
              <Route path="live-events" element={<Suspense fallback={<MiniLoader />}><LiveEventsModule /></Suspense>} />
              <Route path="live-analytics" element={<Suspense fallback={<MiniLoader />}><LiveAnalyticsModule /></Suspense>} />
              <Route path="audit" element={<Suspense fallback={<MiniLoader />}><AuditTrailModule /></Suspense>} />
              <Route path="announcements" element={<Suspense fallback={<MiniLoader />}><AnnouncementsModule /></Suspense>} />
            </Route>
            <Route
              path="/exam/:examId"
              element={
                <ProtectedRoute>
                  <OrientationGate>
                    <ErrorBoundary>
                      <Suspense fallback={<MiniLoader />}>
                        <ExamPage />
                      </Suspense>
                    </ErrorBoundary>
                  </OrientationGate>
                </ProtectedRoute>
              }
            />
            <Route
              path="/mfa"
              element={
                <Suspense fallback={<MiniLoader />}>
                  <MfaPage />
                </Suspense>
              }
            />
            <Route
              path="/privacy"
              element={
                <Suspense fallback={<MiniLoader />}>
                  <PrivacyPage />
                </Suspense>
              }
            />
            {/* Public phone-camera broadcast link — no account needed */}
            <Route
              path="/broadcast/:token"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<MiniLoader />}>
                    <BroadcastPage />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route path="*" element={<NotFound />} />

          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;