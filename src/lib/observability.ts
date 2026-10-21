/**
 * Lightweight client observability: buffered logs, error/unhandledrejection
 * capture, best-effort forwarding to audit_logs via log_audit RPC. Zero-dep.
 */
import { supabase } from "@/integrations/supabase/client";

type Level = "info" | "warn" | "error";
type Entry = { level: Level; msg: string; data?: unknown; at: string; url: string };

const MAX_BUFFER = 100;
const buffer: Entry[] = [];
let installed = false;

const push = (e: Entry) => {
  buffer.push(e);
  if (buffer.length > MAX_BUFFER) buffer.shift();
};

const forwardError = async (msg: string, data: unknown) => {
  try {
    await (supabase as any).rpc("log_audit", {
      _action_type: "client_error",
      _resource_type: "web",
      _target_label: msg.slice(0, 200),
      _metadata: { data: safeSerialize(data) },
      _device_info: {
        ua: navigator.userAgent,
        url: location.href,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      },
    });
  } catch {
    /* offline / RLS: keep silent, entry remains in local buffer */
  }
};

const safeSerialize = (v: unknown) => {
  try { return JSON.parse(JSON.stringify(v)); } catch { return String(v); }
};

export const logger = {
  info(msg: string, data?: unknown) {
    push({ level: "info", msg, data, at: new Date().toISOString(), url: location.href });
  },
  warn(msg: string, data?: unknown) {
    push({ level: "warn", msg, data, at: new Date().toISOString(), url: location.href });
    // eslint-disable-next-line no-console
    console.warn(msg, data);
  },
  error(msg: string, data?: unknown) {
    push({ level: "error", msg, data, at: new Date().toISOString(), url: location.href });
    // eslint-disable-next-line no-console
    console.error(msg, data);
    void forwardError(msg, data);
  },
  snapshot() {
    return [...buffer];
  },
};

export const installObservability = () => {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    logger.error(e.message || "window.error", {
      filename: e.filename, lineno: e.lineno, colno: e.colno,
      stack: e.error?.stack,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason: any = e.reason;
    logger.error("unhandledrejection", { reason: reason?.message || String(reason), stack: reason?.stack });
  });
};
