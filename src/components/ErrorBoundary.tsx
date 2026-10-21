import React from 'react';
import { RouteError } from './RouteError';
import { supabase } from '@/integrations/supabase/client';

interface State { error: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode; fallback?: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Best-effort audit log; ignore failures.
    try {
      supabase.rpc('log_audit' as never, {
        _action_type: 'client_error',
        _resource_type: 'react',
        _target_label: error.name,
        _metadata: { message: error.message, stack: (error.stack || '').slice(0, 2000), component: (info.componentStack || '').slice(0, 2000) } as never,
      } as never).then(() => {}, () => {});
    } catch { /* noop */ }
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return <RouteError error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}
