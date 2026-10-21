import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, PieChart, FileText } from 'lucide-react';
import { ReportsModule } from './ReportsModule';
import { ReportCardGenerator } from './ReportCardGenerator';
import { ExamAnalytics } from './ExamAnalytics';

export const ReportsAnalyticsCombined = () => {
  const [activeTab, setActiveTab] = useState('analytics');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports & Analytics</h1>
        <p className="text-muted-foreground">Performance insights, analytics, and report cards</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="analytics" className="gap-2">
            <PieChart className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="report-cards" className="gap-2">
            <FileText className="h-4 w-4" />
            Report Cards
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="mt-6">
          <ExamAnalytics />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <ReportsModule />
        </TabsContent>

        <TabsContent value="report-cards" className="mt-6">
          <ReportCardGenerator />
        </TabsContent>
      </Tabs>
    </div>
  );
};
