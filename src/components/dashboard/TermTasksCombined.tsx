import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, ClipboardList } from 'lucide-react';
import { TermAndSubjects } from './TermAndSubjects';
import { TasksModule } from './TasksModule';

export const TermTasksCombined = () => {
  const [activeTab, setActiveTab] = useState('tasks');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Term & Tasks</h1>
        <p className="text-muted-foreground">Manage academic terms, subjects, and tasks</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="tasks" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="terms" className="gap-2">
            <Calendar className="h-4 w-4" />
            Terms & Subjects
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-6">
          <TasksModule />
        </TabsContent>

        <TabsContent value="terms" className="mt-6">
          <TermAndSubjects />
        </TabsContent>
      </Tabs>
    </div>
  );
};
