import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAdminStats, type AdminStats } from "@/lib/analytics.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Users, FileText, FileCheck2, CheckCircle2, Clock, ThumbsUp, ThumbsDown, MinusCircle } from "lucide-react";

export const Route = createFileRoute("/admin-x7k2")({
  head: () => ({
    meta: [
      { title: "Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}m ${r}s`;
}

function AdminPage() {
  const fetchStats = useServerFn(getAdminStats);
  const { data, isLoading, isFetching, refetch, error } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => fetchStats(),
    refetchOnWindowFocus: false,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin · Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">Aggregate usage across all sessions.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        {isLoading || !data ? (
          <div className="mt-10 flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard icon={<Users className="h-4 w-4" />} label="Total Visitors" value={data.totalVisitors} />
              <StatCard icon={<FileText className="h-4 w-4" />} label="Total JD Uploads" value={data.totalJdUploads} />
              <StatCard icon={<FileCheck2 className="h-4 w-4" />} label="Total Resume Uploads" value={data.totalResumeUploads} />
              <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Completed Evaluations" value={data.completedEvaluations} />
              <StatCard icon={<Clock className="h-4 w-4" />} label="Average Analysis Time" value={fmtDuration(data.avgAnalysisTimeMs)} />
            </div>

            <Card className="mt-6 p-5">
              <div className="mb-4 text-sm font-semibold">Did you agree with the recommendation?</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <AgreementCell tone="pos" icon={<ThumbsUp className="h-4 w-4" />} label="Yes" value={data.agreement.yes} />
                <AgreementCell tone="warn" icon={<MinusCircle className="h-4 w-4" />} label="Partially" value={data.agreement.partially} />
                <AgreementCell tone="neg" icon={<ThumbsDown className="h-4 w-4" />} label="No" value={data.agreement.no} />
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Total responses: {data.agreement.yes + data.agreement.partially + data.agreement.no}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
    </Card>
  );
}

function AgreementCell({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number; tone: "pos" | "warn" | "neg";
}) {
  const cls =
    tone === "pos" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" :
    tone === "warn" ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400" :
    "border-destructive/30 bg-destructive/5 text-destructive";
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <div className="flex items-center gap-2 text-xs font-medium">{icon} {label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}