import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { evaluateResume, type EvaluationResult, type GuardrailEval } from "@/lib/evaluate.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Sparkles, Loader2, CheckCircle2, AlertTriangle, XCircle,
  Shield, Target, Scale, AlertOctagon, Search, Brain, MessageSquareQuote, Calculator,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lucid Hire — Explainable Resume Evaluation" },
      { name: "description", content: "Evidence-based AI resume evaluation against your job description. Transparent scoring, guardrails, and recruiter interview intelligence." },
      { property: "og:title", content: "Lucid Hire — Explainable Resume Evaluation" },
      { property: "og:description", content: "Evidence-based AI resume evaluation against your job description." },
    ],
  }),
  component: Index,
});

function Index() {
  const evaluate = useServerFn(evaluateResume);
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluationResult | null>(null);

  const onAnalyze = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const r = await evaluate({ data: { jd, resume } });
      setResult(r);
      setTimeout(() => {
        document.getElementById("report")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
        <Hero />
        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <InputCard
            icon={<FileText className="h-4 w-4" />}
            label="Job Description"
            placeholder="Paste the full JD — responsibilities, requirements, must-haves…"
            value={jd}
            onChange={setJd}
          />
          <InputCard
            icon={<FileText className="h-4 w-4" />}
            label="Candidate Resume"
            placeholder="Paste the candidate's resume text…"
            value={resume}
            onChange={setResume}
          />
        </section>

        <div className="mt-6 flex flex-col items-center gap-3">
          <Button
            size="lg"
            onClick={onAnalyze}
            disabled={loading || !jd.trim() || !resume.trim()}
            className="h-12 gap-2 px-8 text-base shadow-[var(--shadow-elevated)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            {loading ? "Analyzing…" : "Run Evaluation"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Only information explicitly present in the resume is used. No inferences are made.
          </p>
          {error && (
            <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {result && (
          <div id="report" className="mt-14">
            <Report result={result} />
          </div>
        )}
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Lucid Hire</span>
          <Badge variant="secondary" className="ml-1 text-[10px]">Beta</Badge>
        </div>
        <div className="text-xs text-muted-foreground">Powered by Groq · Llama 3.3</div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <div className="text-center">
      <Badge variant="secondary" className="mb-4 gap-1">
        <Shield className="h-3 w-3" /> Evidence-based · Explainable · Auditable
      </Badge>
      <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
        Resume evaluation you can{" "}
        <span
          className="bg-clip-text text-transparent"
          style={{ backgroundImage: "var(--gradient-primary)" }}
        >
          actually defend
        </span>
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground">
        Paste a job description and a resume. Get a rubric-driven decision, transparent scoring,
        guardrail evaluation, risk flags, and interview questions — every line traceable to evidence.
      </p>
    </div>
  );
}

function InputCard({
  icon, label, placeholder, value, onChange,
}: {
  icon: React.ReactNode; label: string; placeholder: string;
  value: string; onChange: (v: string) => void;
}) {
  return (
    <Card className="overflow-hidden border-border/70 p-0 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {label}
        </div>
        <span className="text-[11px] text-muted-foreground">{value.length.toLocaleString()} chars</span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[260px] resize-y rounded-none border-0 bg-card font-mono text-[13px] leading-relaxed focus-visible:ring-0"
      />
    </Card>
  );
}

/* ============================ REPORT ============================ */

function Report({ result }: { result: EvaluationResult }) {
  const kw = useMemo(
    () => (result.rubric_keywords || []).filter(Boolean).sort((a, b) => b.length - a.length),
    [result.rubric_keywords],
  );

  return (
    <div className="space-y-6">
      <DecisionHero result={result} />

      <SectionGrid>
        <ReportCard icon={<FileText className="h-4 w-4" />} title="Candidate Summary">
          <p className="text-sm leading-relaxed text-foreground/90">
            <HL text={result.candidate_summary} keywords={kw} />
          </p>
        </ReportCard>

        <ReportCard icon={<Shield className="h-4 w-4" />} title="Critical Requirements">
          <ul className="space-y-2 text-sm">
            {result.critical_requirements?.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                {c.met ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(var(--success))]" style={{ color: "oklch(0.62 0.16 155)" }} />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <span>
                  <span className="font-medium"><HL text={c.requirement} keywords={kw} /></span>
                  {c.note && <span className="text-muted-foreground"> — <HL text={c.note} keywords={kw} /></span>}
                </span>
              </li>
            ))}
          </ul>
        </ReportCard>
      </SectionGrid>

      <ReportCard icon={<Target className="h-4 w-4" />} title="Guardrail Evaluation" full>
        <GuardrailTable guardrails={result.guardrails} kw={kw} />
      </ReportCard>

      <ReportCard icon={<Calculator className="h-4 w-4" />} title="Score Calculation" full>
        <ScoreBreakdown result={result} />
      </ReportCard>

      <SectionGrid>
        <ReportCard icon={<Scale className="h-4 w-4" />} title="Tradeoffs & Missing Requirements">
          <SubList title="Strengths" tone="success" items={result.strengths} kw={kw} />
          <SubList title="Missing Requirements" tone="destructive" items={result.missing_requirements} kw={kw} />
          <SubList title="Tradeoffs" tone="warning" items={result.tradeoffs} kw={kw} />
        </ReportCard>

        <ReportCard icon={<AlertOctagon className="h-4 w-4" />} title="Candidate Risk Alerts">
          <ul className="space-y-2 text-sm">
            {(result.risk_alerts || []).map((r, i) => (
              <li key={i} className="flex items-start gap-2 rounded-md border border-destructive/15 bg-destructive/5 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span><HL text={r} keywords={kw} /></span>
              </li>
            ))}
            {!result.risk_alerts?.length && <li className="text-sm text-muted-foreground">No risks flagged.</li>}
          </ul>
        </ReportCard>
      </SectionGrid>

      <ReportCard icon={<Brain className="h-4 w-4" />} title="AI Self-Audit" full>
        <div className="grid gap-6 md:grid-cols-3">
          <SubList title="Assumptions Made" tone="info" items={result.assumptions} kw={kw} dense />
          <SubList title="Missing Information" tone="warning" items={result.missing_information} kw={kw} dense />
          <SubList title="Verification Needed" tone="info" items={result.verification_needed} kw={kw} dense />
        </div>
      </ReportCard>

      <ReportCard icon={<MessageSquareQuote className="h-4 w-4" />} title="Interview Intelligence" full>
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top 5 Questions</div>
          <ol className="mb-6 space-y-2 text-sm">
            {(result.top_5_questions || []).map((q, i) => (
              <li key={i} className="flex gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                <span className="font-mono text-xs text-primary">{String(i + 1).padStart(2, "0")}</span>
                <span><HL text={q} keywords={kw} /></span>
              </li>
            ))}
          </ol>
          <Separator className="my-4" />
          <div className="space-y-3">
            {(result.interview_questions || []).map((q, i) => (
              <details key={i} className="group rounded-lg border border-border/60 bg-card px-4 py-3 open:shadow-[var(--shadow-card)]">
                <summary className="flex cursor-pointer items-start justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <div className="flex-1"><HL text={q.question} keywords={kw} /></div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">{q.category}</Badge>
                </summary>
                <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
                  <Field label="Why it matters" text={q.why_matters} kw={kw} />
                  <Field label="Strong answer" text={q.strong_answer} kw={kw} />
                  <Field label="Risk signal" text={q.risk_signal} kw={kw} />
                </div>
              </details>
            ))}
          </div>
        </div>
      </ReportCard>
    </div>
  );
}

function DecisionHero({ result }: { result: EvaluationResult }) {
  const meta = decisionMeta(result.decision);
  const score = Math.max(0, Math.min(100, Math.round(result.match_score)));
  return (
    <Card className="overflow-hidden border-border/70 p-0 shadow-[var(--shadow-elevated)]">
      <div className="relative p-6 sm:p-8" style={{ background: "var(--gradient-primary)" }}>
        <div className="flex flex-wrap items-start justify-between gap-6 text-primary-foreground">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest opacity-80">
              <Shield className="h-3.5 w-3.5" /> Hiring Recommendation
            </div>
            <div className="flex items-center gap-3">
              <meta.Icon className="h-7 w-7" />
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{result.decision}</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-primary-foreground/90">{result.description}</p>
          </div>
          <div className="flex items-center gap-6">
            <ScoreDial value={score} />
            <div>
              <div className="text-xs uppercase tracking-widest opacity-80">Confidence</div>
              <div className="mt-1 text-xl font-semibold">{result.confidence}</div>
              <Badge className="mt-2 border-white/30 bg-white/15 text-primary-foreground hover:bg-white/20">
                {meta.label}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ScoreDial({ value }: { value: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  return (
    <div className="relative h-24 w-24">
      <svg viewBox="0 0 96 96" className="h-24 w-24 -rotate-90">
        <circle cx="48" cy="48" r={r} stroke="currentColor" strokeOpacity="0.25" strokeWidth="8" fill="none" />
        <circle
          cx="48" cy="48" r={r}
          stroke="white" strokeWidth="8" fill="none" strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-primary-foreground">
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-widest opacity-80">/ 100</div>
      </div>
    </div>
  );
}

function decisionMeta(d: EvaluationResult["decision"]) {
  switch (d) {
    case "Strong Proceed": return { Icon: CheckCircle2, label: "Recommend Advance" };
    case "Proceed with Review": return { Icon: CheckCircle2, label: "Advance with Validation" };
    case "Manual Review Required": return { Icon: AlertTriangle, label: "Needs Recruiter Judgment" };
    case "Unlikely Fit": return { Icon: XCircle, label: "Likely Pass" };
  }
}

function GuardrailTable({ guardrails, kw }: { guardrails: GuardrailEval[]; kw: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border/70 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Requirement</th>
            <th className="px-3 py-2 font-medium">Weight</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Contribution</th>
            <th className="px-3 py-2 font-medium">Reasoning & Evidence</th>
          </tr>
        </thead>
        <tbody>
          {guardrails?.map((g, i) => (
            <tr key={i} className="border-b border-border/40 align-top last:border-0">
              <td className="px-3 py-3 font-medium"><HL text={g.requirement} keywords={kw} /></td>
              <td className="px-3 py-3 text-muted-foreground">{g.weight}%</td>
              <td className="px-3 py-3"><MatchBadge status={g.match_status} /></td>
              <td className="px-3 py-3">
                <div className="font-mono text-xs">{g.contribution.toFixed(1)} pts</div>
                <Progress value={(g.contribution / g.weight) * 100} className="mt-1 h-1.5" />
              </td>
              <td className="px-3 py-3 text-xs text-foreground/80">
                <div className="mb-1.5 font-medium text-foreground">Explanation</div>
                <ul className="mb-2 list-inside list-disc space-y-0.5">
                  {g.explanation?.map((e, j) => <li key={j}><HL text={e} keywords={kw} /></li>)}
                </ul>
                <div className="mb-1.5 font-medium text-foreground">Evidence</div>
                <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                  {g.evidence?.map((e, j) => <li key={j}><HL text={e} keywords={kw} /></li>)}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchBadge({ status }: { status: GuardrailEval["match_status"] }) {
  const styles: Record<string, string> = {
    "Strong Match": "bg-[oklch(0.62_0.16_155/0.12)] text-[oklch(0.4_0.16_155)] border-[oklch(0.62_0.16_155/0.3)]",
    "Partial Match": "bg-[oklch(0.75_0.16_75/0.15)] text-[oklch(0.4_0.14_70)] border-[oklch(0.75_0.16_75/0.35)]",
    "Weak Match": "bg-[oklch(0.7_0.12_40/0.15)] text-[oklch(0.45_0.18_35)] border-[oklch(0.7_0.12_40/0.35)]",
    "No Evidence": "bg-destructive/10 text-destructive border-destructive/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function ScoreBreakdown({ result }: { result: EvaluationResult }) {
  const total = result.guardrails?.reduce((s, g) => s + g.contribution, 0) ?? 0;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{result.score_calculation}</p>
      <div className="space-y-2">
        {result.guardrails?.map((g, i) => (
          <div key={i} className="flex items-center gap-3 text-xs">
            <div className="w-48 truncate font-medium text-foreground">{g.requirement}</div>
            <div className="flex-1">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${g.contribution}%`, background: "var(--gradient-primary)" }}
                />
              </div>
            </div>
            <div className="w-32 text-right font-mono text-muted-foreground">
              {g.weight}% × {pct(g.match_status)} = <span className="font-semibold text-foreground">{g.contribution.toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>
      <Separator />
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">Final Match Score</span>
        <span className="font-mono text-lg font-bold">{total.toFixed(1)} / 100</span>
      </div>
    </div>
  );
}

function pct(s: GuardrailEval["match_status"]) {
  return s === "Strong Match" ? "100%" : s === "Partial Match" ? "60%" : s === "Weak Match" ? "30%" : "0%";
}

function SectionGrid({ children }: { children: React.ReactNode }) {
  return <section className="grid gap-6 md:grid-cols-2">{children}</section>;
}

function ReportCard({
  icon, title, children, full,
}: { icon: React.ReactNode; title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <Card className={`overflow-hidden border-border/70 p-0 shadow-[var(--shadow-card)] ${full ? "md:col-span-2" : ""}`}>
      <div className="flex items-center gap-2 border-b border-border/70 bg-muted/30 px-5 py-3 text-sm font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
        {title}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

function SubList({
  title, tone, items, kw, dense,
}: { title: string; tone: "success" | "warning" | "destructive" | "info"; items?: string[]; kw: string[]; dense?: boolean }) {
  const dot: Record<string, string> = {
    success: "bg-[oklch(0.62_0.16_155)]",
    warning: "bg-[oklch(0.75_0.16_75)]",
    destructive: "bg-destructive",
    info: "bg-[oklch(0.62_0.15_230)]",
  };
  return (
    <div className={dense ? "" : "mb-4 last:mb-0"}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul className="space-y-1.5 text-sm">
        {(items || []).map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot[tone]}`} />
            <span><HL text={s} keywords={kw} /></span>
          </li>
        ))}
        {!items?.length && <li className="text-xs text-muted-foreground">None.</li>}
      </ul>
    </div>
  );
}

function Field({ label, text, kw }: { label: string; text: string; kw: string[] }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/70">{label}</div>
      <div className="text-xs leading-relaxed"><HL text={text} keywords={kw} /></div>
    </div>
  );
}

/** Highlight rubric keywords in any text. */
function HL({ text, keywords }: { text: string; keywords: string[] }) {
  if (!text) return null;
  if (!keywords?.length) return <>{text}</>;
  const escaped = keywords
    .map((k) => k.trim())
    .filter((k) => k.length > 1)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return <>{text}</>;
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const set = new Set(keywords.map((k) => k.toLowerCase()));
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        set.has(p.toLowerCase()) ? <span key={i} className="rubric-kw">{p}</span> : <span key={i}>{p}</span>,
      )}
    </>
  );
}
