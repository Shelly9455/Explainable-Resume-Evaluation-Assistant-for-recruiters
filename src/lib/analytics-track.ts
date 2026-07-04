import { logAnalyticsEvent } from "./analytics.functions";

function sessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem("lh_session_id");
    if (!id) {
      id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string;
      sessionStorage.setItem("lh_session_id", id);
    }
    return id;
  } catch { return ""; }
}

export function track(
  event_type: "visitor" | "jd_upload" | "resume_upload" | "evaluation_complete" | "agreement",
  extra?: { duration_ms?: number; agreement?: "yes" | "partially" | "no" },
) {
  const sid = sessionId();
  // Dedupe visitor per session on the client.
  if (event_type === "visitor") {
    try {
      if (sessionStorage.getItem("lh_visited")) return;
      sessionStorage.setItem("lh_visited", "1");
    } catch { /* ignore */ }
  }
  void logAnalyticsEvent({
    data: { event_type, session_id: sid || undefined, ...extra },
  }).catch(() => { /* silent */ });
}