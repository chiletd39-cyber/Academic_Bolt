import { Outlet } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardHeader } from './DashboardHeader';
import { ActiveClassProvider } from '@/contexts/ActiveClassContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useTranslation } from 'react-i18next';

export const DashboardLayout = () => {
  const { t } = useTranslation();
  return (
    <ActiveClassProvider>
      <SidebarProvider>
        <a href="#main-content" className="skip-link">
          {t('common.skipToContent', 'Skip to content')}
        </a>
        <div className="min-h-dvh flex w-full bg-background safe-area-inset">
          <DashboardSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <DashboardHeader />
            <main id="main-content" className="flex-1 p-4 sm:p-6 overflow-auto" tabIndex={-1}>
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </ActiveClassProvider>
  );
};
