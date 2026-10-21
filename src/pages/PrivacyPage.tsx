import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Database, Clock, Download, Trash2 } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Privacy & Data Protection
          </h1>
          <Link to="/" className="text-sm text-primary hover:underline">Back home</Link>
        </div>
        <p className="text-sm text-muted-foreground">
          This page is maintained by the school administration to summarise how the Academic System
          handles your personal data. It is not an independent certification.
        </p>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Database className="w-4 h-4" />What we store</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>Profile (name, role, class, optional phone), exam submissions and scores,
            notifications, parent–child links, audit logs of sensitive actions, and exam
            proctoring snapshots/recordings when applicable.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock className="w-4 h-4" />Retention windows</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Exam snapshots: 30 days</li>
              <li>Recordings: 90 days</li>
              <li>Notifications: 180 days</li>
              <li>Audit logs: 365 days</li>
              <li>PII access log: 365 days</li>
              <li>Rate-limit counters: 7 days</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Download className="w-4 h-4" />Your rights</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>Open <span className="font-medium">Profile → Privacy</span> to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><Download className="w-3 h-3 inline mr-1" />Download a JSON copy of your data.</li>
              <li><Trash2 className="w-3 h-3 inline mr-1" />Permanently delete your account and associated records.</li>
            </ul>
            <p>Contact your school administrator for rectification of academic records.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
