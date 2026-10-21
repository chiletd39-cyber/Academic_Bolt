import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, FileText } from 'lucide-react';
import { ReportsModule } from './ReportsModule';
import { ReportCardGenerator } from './ReportCardGenerator';

export const ReportsCombined = () => {
  const [activeTab, setActiveTab] = useState('analytics');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-muted-foreground">Analytics, insights, and report card generation</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="report-cards" className="gap-2">
            <FileText className="h-4 w-4" />
            Report Cards
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="mt-6">
          <ReportsModule />
        </TabsContent>

        <TabsContent value="report-cards" className="mt-6">
          <ReportCardGenerator />
        </TabsContent>
      </Tabs>
    </div>
  );
};
