import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const eventSchema = z.object({
  event_type: z.enum([
    "visitor",
    "jd_upload",
    "resume_upload",
    "evaluation_complete",
    "agreement",
  ]),
  duration_ms: z.number().int().nonnegative().optional(),
  agreement: z.enum(["yes", "partially", "no"]).optional(),
  session_id: z.string().max(64).optional(),
});

export const logAnalyticsEvent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => eventSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("analytics_events").insert({
      event_type: data.event_type,
      duration_ms: data.duration_ms ?? null,
      agreement: data.agreement ?? null,
      session_id: data.session_id ?? null,
    });
    return { ok: true };
  });

export interface AdminStats {
  totalVisitors: number;
  totalJdUploads: number;
  totalResumeUploads: number;
  completedEvaluations: number;
  avgAnalysisTimeMs: number | null;
  agreement: { yes: number; partially: number; no: number };
}

export const getAdminStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminStats> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const countOf = async (type: string) => {
      const { count } = await supabaseAdmin
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", type);
      return count ?? 0;
    };

    const [visitors, jd, resumes, evals] = await Promise.all([
      countOf("visitor"),
      countOf("jd_upload"),
      countOf("resume_upload"),
      countOf("evaluation_complete"),
    ]);

    const { data: durRows } = await supabaseAdmin
      .from("analytics_events")
      .select("duration_ms")
      .eq("event_type", "evaluation_complete")
      .not("duration_ms", "is", null);
    const durs = (durRows ?? []).map((r) => Number(r.duration_ms)).filter((n) => Number.isFinite(n));
    const avgAnalysisTimeMs = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;

    const { data: agRows } = await supabaseAdmin
      .from("analytics_events")
      .select("agreement")
      .eq("event_type", "agreement");
    const agreement = { yes: 0, partially: 0, no: 0 };
    for (const r of agRows ?? []) {
      const v = r.agreement as "yes" | "partially" | "no" | null;
      if (v && v in agreement) agreement[v] += 1;
    }

    return {
      totalVisitors: visitors,
      totalJdUploads: jd,
      totalResumeUploads: resumes,
      completedEvaluations: evals,
      avgAnalysisTimeMs,
      agreement,
    };
  },
);