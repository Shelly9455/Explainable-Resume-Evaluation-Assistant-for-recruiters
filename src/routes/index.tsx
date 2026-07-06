import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { track } from "@/lib/analytics-track";
import {
  analyzeJD,
  evaluateResume,
  type EvaluationResult,
  type GuardrailEval,
  type JDAnalysis,
  type LockedCriteria,
  type SuggestedGuardrail,
  type WeightageBucket,
  type CriticalRequirement,
} from "@/lib/evaluate.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { extractFileText } from "@/lib/pdf-extract";
import {
  FileText, Sparkles, Loader2, CheckCircle2, AlertTriangle, XCircle,
  Shield, Target, Scale, AlertOctagon, Brain, MessageSquareQuote, Calculator,
  ArrowRight, ArrowLeft, Upload, Lock, Plus, Trash2, RotateCcw, Wand2, ThumbsUp, ThumbsDown, Clock,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lucid Hire — Explainable Resume Evaluation" },
      { name: "description", content: "Recruiter-configured, evidence-based AI resume evaluation. Customize rubric and weightages, then evaluate candidates." },
    ],
  }),
  component: Index,
});

type Step = 1 | 2 | 3 | 4;
type ReviewStatus = "pending" | "approved" | "rejected";

interface EditableGuardrail extends SuggestedGuardrail {
  status: ReviewStatus;
  custom?: boolean;
}

interface EditableCriticalReq extends CriticalRequirement {
  id: string;
  status: ReviewStatus;
}

function Index() {
  const [step, setStep] = useState<Step>(1);

  const [jd, setJd] = useState("");
  const [resume, setResume] = useState("");

  const [analysis, setAnalysis] = useState<JDAnalysis | null>(null);
  const [guardrails, setGuardrails] = useState<EditableGuardrail[]>([]);
  const [weights, setWeights] = useState<WeightageBucket[]>([]);
  const [criticalReqs, setCriticalReqs] = useState<EditableCriticalReq[]>([]);

  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useServerFn(analyzeJD);
  const evaluate = useServerFn(evaluateResume);

  const evalStartRef = useRef<number | null>(null);
  useEffect(() => { track("visitor"); }, []);

  const onAnalyzeJD = async () => {
    setError(null); setLoading(true);
    try {
      track("jd_upload");
      const a = await analyze({ data: { jd } });
      setAnalysis(a);
      setGuardrails(a.suggested_guardrails.map((g) => ({ ...g, status: "pending" as ReviewStatus })));
      setWeights(a.recommended_weightages.map((w) => ({ ...w })));
      setCriticalReqs(
        a.critical_requirements.map((r, i) => ({ ...r, id: `cr${i}`, status: "pending" as ReviewStatus })),
      );
      setStep(2);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const lockedCriteria: LockedCriteria = useMemo(() => ({
    guardrails: guardrails.filter((g) => g.status === "approved").map((g) => ({
      name: g.name, explanation: g.explanation, importance: g.importance,
    })),
    weightages: weights.map((w) => ({ label: w.guardrail_requirement, weight: w.weight })),
    critical_requirements: criticalReqs.filter((r) => r.status === "approved").map((r) => r.requirement),
  }), [guardrails, weights, criticalReqs]);

  const totalWeight = weights.reduce((s, w) => s + (Number(w.weight) || 0), 0);
  const activeGuardrails = guardrails.filter((g) => g.status === "approved").length;
  const approvedCriticals = criticalReqs.filter((r) => r.status === "approved").length;
  const pendingReview =
    guardrails.filter((g) => g.status === "pending").length +
    criticalReqs.filter((r) => r.status === "pending").length;

  const onEvaluate = async () => {
    setError(null); setLoading(true);
    track("resume_upload");
    evalStartRef.current = Date.now();
    try {
      const r = await evaluate({ data: { jd, resume, criteria: lockedCriteria } });
      setResult(r);
      const started = evalStartRef.current;
      track("evaluation_complete", started ? { duration_ms: Date.now() - started } : undefined);
      setStep(4);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const reset = () => {
    setStep(1); setJd(""); setResume(""); setAnalysis(null);
    setGuardrails([]); setWeights([]); setCriticalReqs([]); setResult(null); setError(null);
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        <Stepper current={step} />

        {error && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {step === 1 && (
          <Step1
            jd={jd} setJd={setJd}
            loading={loading} onNext={onAnalyzeJD}
          />
        )}

        {step === 2 && analysis && (
          <Step2
            analysis={analysis}
            guardrails={guardrails} setGuardrails={setGuardrails}
            weights={weights} setWeights={setWeights}
            criticalReqs={criticalReqs} setCriticalReqs={setCriticalReqs}
            totalWeight={totalWeight}
            approvedGuardrails={activeGuardrails}
            approvedCriticals={approvedCriticals}
            pendingReview={pendingReview}
            onBack={() => setStep(1)}
            onLock={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <Step3
            resume={resume} setResume={setResume}
            activeGuardrails={activeGuardrails}
            weights={weights}
            criticalCount={approvedCriticals}
            loading={loading}
            onBack={() => setStep(2)}
            onEvaluate={onEvaluate}
          />
        )}

        {step === 4 && result && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(3)} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back to resume
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => { setResume(""); setResult(null); setError(null); setStep(3); }}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" /> Analyze another resume
                </Button>
                <Button variant="outline" size="sm" onClick={reset} className="gap-2">
                  <RotateCcw className="h-4 w-4" /> New JD
                </Button>
              </div>
            </div>
            <Report result={result} resume={resume} jd={jd} criteria={lockedCriteria} />
          </div>
        )}
      </main>
    </div>
  );
}

/* ============================ HEADER & STEPPER ============================ */

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground"
               style={{ background: "var(--gradient-primary)" }}>
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

function Stepper({ current }: { current: Step }) {
  const steps = [
    { n: 1, label: "JD Upload" },
    { n: 2, label: "Analysis & Criteria" },
    { n: 3, label: "Resume Upload" },
    { n: 4, label: "Evaluation" },
  ];
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {steps.map((s, i) => {
        const active = current === s.n;
        const done = current > s.n;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              active ? "border-primary bg-primary text-primary-foreground" :
              done ? "border-primary/40 bg-primary/10 text-primary" :
              "border-border bg-muted/40 text-muted-foreground"
            }`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                active ? "bg-primary-foreground/20" : done ? "bg-primary/20" : "bg-muted"
              }`}>{done ? <CheckCircle2 className="h-3 w-3" /> : s.n}</span>
              <span className="whitespace-nowrap">{s.label}</span>
            </div>
            {i < steps.length - 1 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );
}

/* ============================ STEP 1 ============================ */

function Step1({ jd, setJd, loading, onNext }: {
  jd: string; setJd: (v: string) => void; loading: boolean; onNext: () => void;
}) {
  const onFile = async (f: File | null) => {
    if (!f) return;
    const text = await extractFileText(f);
    setJd(text);
  };
  return (
    <div className="mt-8">
      <div className="text-center">
        <Badge variant="secondary" className="mb-3 gap-1"><Shield className="h-3 w-3" /> Step 1 of 4</Badge>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Upload your job description</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          We'll derive a transparent hiring rubric you can review and customize before any candidate is evaluated.
        </p>
      </div>

      <Card className="mt-8 overflow-hidden border-border/70 p-0 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" /> Job Description
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted">
            <Upload className="h-3.5 w-3.5" /> Upload .pdf / .txt / .md
            <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className="hidden"
                   onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <Textarea
          value={jd} onChange={(e) => setJd(e.target.value)}
          placeholder="Paste the full JD — responsibilities, requirements, must-haves…"
          className="min-h-[320px] resize-y rounded-none border-0 bg-card font-mono text-[13px] leading-relaxed focus-visible:ring-0"
        />
      </Card>

      <div className="mt-6 flex flex-col items-center gap-2">
        <Button size="lg" onClick={onNext} disabled={loading || !jd.trim()}
                className="h-12 gap-2 px-8 text-base shadow-[var(--shadow-elevated)]"
                style={{ background: "var(--gradient-primary)" }}>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
          {loading ? "Analyzing JD…" : "Analyze JD"}
        </Button>
        <p className="text-xs text-muted-foreground">No candidate data is required yet.</p>
      </div>
    </div>
  );
}

/* ============================ STEP 2 ============================ */

function Step2({
  analysis, guardrails, setGuardrails, weights, setWeights,
  criticalReqs, setCriticalReqs, totalWeight,
  approvedGuardrails, approvedCriticals, pendingReview,
  onBack, onLock,
}: {
  analysis: JDAnalysis;
  guardrails: EditableGuardrail[];
  setGuardrails: (g: EditableGuardrail[]) => void;
  weights: WeightageBucket[];
  setWeights: (w: WeightageBucket[]) => void;
  criticalReqs: EditableCriticalReq[];
  setCriticalReqs: (c: EditableCriticalReq[]) => void;
  totalWeight: number;
  approvedGuardrails: number;
  approvedCriticals: number;
  pendingReview: number;
  onBack: () => void;
  onLock: () => void;
}) {
  const valid = guardrails.some((g) => g.status === "approved");

  const updateGuardrail = (id: string, patch: Partial<EditableGuardrail>) =>
    setGuardrails(guardrails.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const deleteGuardrail = (id: string) =>
    setGuardrails(guardrails.filter((g) => g.id !== id));
  const addGuardrail = () =>
    setGuardrails([{
      id: `c${Date.now()}`, name: "New guardrail", explanation: "", importance: "Medium",
      reason: "", risk_if_ignored: "",
      status: "pending", custom: true,
    }, ...guardrails]);

  const resetWeights = () =>
    setWeights(analysis.recommended_weightages.map((w) => ({ ...w })));

  const updateWeight = (key: WeightageBucket["key"], next: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(next)));
    const current = weights.find((w) => w.key === key);
    if (!current) return;
    const delta = clamped - current.weight;
    if (delta === 0) return;
    const others = weights.filter((w) => w.key !== key);
    const othersTotal = others.reduce((s, w) => s + w.weight, 0);
    // Distribute -delta across other buckets proportionally; fall back to equal split.
    let remaining = -delta;
    const adjusted = others.map((w, i) => {
      let share: number;
      if (i === others.length - 1) {
        share = remaining;
      } else if (othersTotal > 0) {
        share = Math.round((-delta) * (w.weight / othersTotal));
      } else {
        share = Math.round(-delta / others.length);
      }
      remaining -= share;
      const nextW = Math.max(0, Math.min(100, w.weight + share));
      return { ...w, weight: nextW };
    });
    const next2 = weights.map((w) =>
      w.key === key ? { ...w, weight: clamped } : adjusted.find((a) => a.key === w.key)!,
    );
    // Final correction so total is exactly 100.
    const total = next2.reduce((s, w) => s + w.weight, 0);
    if (total !== 100 && next2.length > 1) {
      const diff = 100 - total;
      const target = next2.find((w) => w.key !== key);
      if (target) target.weight = Math.max(0, Math.min(100, target.weight + diff));
    }
    setWeights(next2);
  };
  const updateWeightLabel = (key: WeightageBucket["key"], label: string) =>
    setWeights(weights.map((w) => (w.key === key ? { ...w, guardrail_requirement: label } : w)));
  const deleteWeight = (key: WeightageBucket["key"]) =>
    setWeights(weights.filter((w) => w.key !== key));
  const addWeight = () =>
    setWeights([{ key: `w${Date.now()}`, guardrail_requirement: "New bucket", weight: 0, rationale: "Custom weightage" }, ...weights]);
  // Critical requirements UI removed per request; setCriticalReqs kept for future use.
  void setCriticalReqs;
  void approvedCriticals;

  return (
    <div className="mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Edit JD
        </Button>
        <Badge variant="secondary" className="gap-1"><Brain className="h-3 w-3" /> Step 2 of 4</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatusTile icon={<Target className="h-4 w-4" />} label="Guardrails approved"
          value={`${approvedGuardrails} / ${guardrails.length}`} tone="primary" />
        <StatusTile icon={<Clock className="h-4 w-4" />} label="Pending review"
          value={`${pendingReview}`} tone={pendingReview > 0 ? "warning" : "muted"} />
      </div>

      <SectionCard icon={<FileText className="h-4 w-4" />} title="Role Summary">
        <p className="text-sm leading-relaxed text-foreground/90">{analysis.role_summary}</p>
      </SectionCard>

      <SectionCard icon={<Target className="h-4 w-4" />} title="Suggested Guardrails"
        action={<Button variant="outline" size="sm" onClick={addGuardrail} className="gap-2">
          <Plus className="h-3.5 w-3.5" /> Add guardrail
        </Button>}>
        <div className="space-y-3">
          {guardrails.map((g) => (
            <div key={g.id} className={`rounded-lg border bg-card p-3 ${
              g.status === "approved" ? "border-[oklch(0.62_0.16_155/0.45)]" :
              g.status === "rejected" ? "border-destructive/30 opacity-60" : "border-border"
            }`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Input
                    value={g.name}
                    onChange={(e) => updateGuardrail(g.id, { name: e.target.value })}
                    className="h-8 min-w-[180px] flex-1 text-sm font-semibold"
                    placeholder="Guardrail name"
                  />
                  <select
                    value={g.importance}
                    onChange={(e) => updateGuardrail(g.id, { importance: e.target.value as "High" | "Medium" | "Low" })}
                    className="h-8 rounded-md border border-input bg-card px-2 text-xs font-medium"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                  {g.custom && <Badge variant="secondary" className="text-[10px]">Custom</Badge>}
                </div>
                <StatusPill status={g.status} />
              </div>
              <Textarea
                value={g.explanation}
                onChange={(e) => updateGuardrail(g.id, { explanation: e.target.value })}
                placeholder="Short explanation of this guardrail"
                className="mt-2 min-h-[56px] resize-y text-xs leading-relaxed"
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <EditableFieldBlock tone="info" label="Reason" value={g.reason ?? ""}
                  onChange={(v) => updateGuardrail(g.id, { reason: v })} />
                <EditableFieldBlock tone="danger" label="Risk if ignored" value={g.risk_if_ignored ?? ""}
                  onChange={(v) => updateGuardrail(g.id, { risk_if_ignored: v })} />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" variant={g.status === "approved" ? "default" : "outline"}
                  onClick={() => updateGuardrail(g.id, { status: "approved" })} className="h-7 gap-1.5 text-xs">
                  <ThumbsUp className="h-3.5 w-3.5" /> {g.status === "approved" ? "Approved" : "Approve"}
                </Button>
                <Button size="sm" variant={g.status === "rejected" ? "destructive" : "outline"}
                  onClick={() => updateGuardrail(g.id, { status: "rejected" })} className="h-7 gap-1.5 text-xs">
                  <ThumbsDown className="h-3.5 w-3.5" /> {g.status === "rejected" ? "Rejected" : "Reject"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteGuardrail(g.id)} className="ml-auto h-7 w-7 p-0">
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard icon={<Scale className="h-4 w-4" />} title="Recommended Evaluation Weightages"
        action={<div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addWeight} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Add bucket
          </Button>
          <Button variant="outline" size="sm" onClick={resetWeights} className="gap-2">
            <RotateCcw className="h-3.5 w-3.5" /> Reset to AI
          </Button>
        </div>}>
        <div className="space-y-3">
          {weights.map((w) => (
            <div key={w.key} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Input
                  value={w.guardrail_requirement}
                  onChange={(e) => updateWeightLabel(w.key, e.target.value)}
                  className="h-8 min-w-[160px] flex-1 text-sm font-medium"
                  placeholder="Bucket label"
                />
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number" min={0} max={100}
                    value={w.weight}
                    onChange={(e) => updateWeight(w.key, Number(e.target.value))}
                    className="h-8 w-16 text-right font-mono text-sm"
                  />
                  <span className="text-xs font-semibold text-muted-foreground">%</span>
                  <Button size="sm" variant="ghost" onClick={() => deleteWeight(w.key)}
                    className="h-8 w-8 p-0">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <Slider
                value={[w.weight]} min={0} max={100} step={1}
                onValueChange={(v) => updateWeight(w.key, v[0] ?? 0)}
                className="mt-3"
              />
              <p className="mt-2 text-xs text-muted-foreground">{w.rationale}</p>
            </div>
          ))}
          <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium ${
            totalWeight === 100 ? "border-[oklch(0.62_0.16_155/0.4)] bg-[oklch(0.62_0.16_155/0.06)] text-[oklch(0.4_0.15_155)]"
              : "border-destructive/40 bg-destructive/5 text-destructive"
          }`}>
            <span>Total weight</span>
            <span className="font-mono font-semibold">{totalWeight}% {totalWeight === 100 ? "✓" : "(must equal 100%)"}</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={<Lock className="h-4 w-4" />} title="Final Evaluation Criteria Summary">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approved Guardrails ({approvedGuardrails})</div>
            <ul className="space-y-1 text-sm">
              {guardrails.filter((g) => g.status === "approved").map((g) => (
                <li key={g.id} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {g.name}
                  <span className="text-xs text-muted-foreground">· {g.importance}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Final Weightages</div>
            <ul className="space-y-1 text-sm">
              {weights.map((w) => (
                <li key={w.key} className="flex items-center justify-between">
                  <span>{w.guardrail_requirement}</span>
                  <span className="font-mono text-xs">{w.weight}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SectionCard>

      <div className="flex flex-col items-center gap-2">
        <Button size="lg" onClick={onLock} disabled={!valid}
                className="h-12 gap-2 px-8 text-base shadow-[var(--shadow-elevated)]"
                style={{ background: "var(--gradient-primary)" }}>
          <Lock className="h-5 w-5" /> Lock Criteria & Continue
        </Button>
        {!valid && <p className="text-xs text-destructive">Approve at least one guardrail to continue.</p>}
      </div>
    </div>
  );
}

function ImportanceBadge({ value }: { value: "High" | "Medium" | "Low" }) {
  const tone: Record<string, string> = {
    High: "bg-destructive/10 text-destructive border-destructive/30",
    Medium: "bg-[oklch(0.75_0.16_75/0.15)] text-[oklch(0.45_0.16_70)] border-[oklch(0.75_0.16_75/0.35)]",
    Low: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${tone[value]}`}>
      {value}
    </span>
  );
}

function StatusPill({ status }: { status: ReviewStatus }) {
  if (status === "approved") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[oklch(0.62_0.16_155/0.45)] bg-[oklch(0.62_0.16_155/0.1)] px-2 py-0.5 text-[10px] font-semibold text-[oklch(0.4_0.15_155)]">
      <CheckCircle2 className="h-3 w-3" /> Approved
    </span>
  );
  if (status === "rejected") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
      <XCircle className="h-3 w-3" /> Rejected
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      <Clock className="h-3 w-3" /> Pending review
    </span>
  );
}

function StatusTile({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: string;
  tone: "primary" | "success" | "warning" | "muted";
}) {
  const toneCls: Record<string, string> = {
    primary: "border-primary/30 bg-primary/5 text-primary",
    success: "border-[oklch(0.62_0.16_155/0.4)] bg-[oklch(0.62_0.16_155/0.06)] text-[oklch(0.4_0.15_155)]",
    warning: "border-[oklch(0.65_0.19_42/0.4)] bg-[oklch(0.65_0.19_42/0.08)] text-[oklch(0.5_0.19_42)]",
    muted: "border-border bg-muted/40 text-muted-foreground",
  };
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${toneCls[tone]}`}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/60">{icon}</div>
      <div className="flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</div>
        <div className="text-base font-bold leading-tight">{value}</div>
      </div>
    </div>
  );
}

/* ============================ STEP 3 ============================ */

function Step3({
  resume, setResume, activeGuardrails, weights, criticalCount, loading, onBack, onEvaluate,
}: {
  resume: string; setResume: (v: string) => void;
  activeGuardrails: number; weights: WeightageBucket[]; criticalCount: number;
  loading: boolean; onBack: () => void; onEvaluate: () => void;
}) {
  const onFile = async (f: File | null) => {
    if (!f) return;
    const text = await extractFileText(f);
    setResume(text);
  };
  return (
    <div className="mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Edit criteria
        </Button>
        <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" /> Step 3 of 4</Badge>
      </div>

      <Card className="overflow-hidden border-[oklch(0.62_0.16_155/0.4)] bg-[oklch(0.62_0.16_155/0.06)] p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4 text-[oklch(0.45_0.16_155)]" /> Evaluation Criteria Locked
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{activeGuardrails}</span> active guardrails
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{criticalCount}</span> critical requirements
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {weights.map((w) => (
              <span key={w.key} className="rounded-full border border-border bg-card px-2 py-0.5">
                {w.guardrail_requirement} <span className="font-mono font-semibold">{w.weight}%</span>
              </span>
            ))}
          </div>
        </div>
      </Card>

      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Upload candidate resume</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          The resume will be evaluated using your approved guardrails and weightages.
        </p>
      </div>

      <Card className="overflow-hidden border-border/70 p-0 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" /> Candidate Resume
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted">
            <Upload className="h-3.5 w-3.5" /> Upload .pdf / .txt / .md
            <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className="hidden"
                   onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <Textarea value={resume} onChange={(e) => setResume(e.target.value)}
                  placeholder="Paste the candidate's resume text…"
                  className="min-h-[320px] resize-y rounded-none border-0 bg-card font-mono text-[13px] leading-relaxed focus-visible:ring-0" />
      </Card>

      <div className="flex flex-col items-center gap-2">
        <Button size="lg" onClick={onEvaluate} disabled={loading || !resume.trim()}
                className="h-12 gap-2 px-8 text-base shadow-[var(--shadow-elevated)]"
                style={{ background: "var(--gradient-primary)" }}>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          {loading ? "Evaluating candidate…" : "Evaluate Candidate"}
        </Button>
        <p className="text-xs text-muted-foreground">Only information explicitly present in the resume is used.</p>
      </div>
    </div>
  );
}

/* ============================ SHARED ============================ */

function SectionCard({ icon, title, children, action }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-border/70 p-0 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-5 py-3 text-sm font-semibold">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
          {title}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

function FieldBlock({ tone, label, text }: {
  tone: "info" | "warning" | "danger"; label: string; text: string;
}) {
  const toneCls: Record<string, string> = {
    info: "border-l-primary bg-primary/5 text-primary",
    warning: "border-l-[oklch(0.65_0.19_42)] bg-[oklch(0.65_0.19_42/0.07)] text-[oklch(0.5_0.19_42)]",
    danger: "border-l-destructive bg-destructive/5 text-destructive",
  };
  return (
    <div className={`rounded-md border border-border border-l-4 px-2.5 py-2 ${toneCls[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 text-xs leading-relaxed text-foreground/85">{text}</div>
    </div>
  );
}

function EditableFieldBlock({ tone, label, value, onChange, placeholder }: {
  tone: "info" | "warning" | "danger";
  label: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const toneCls: Record<string, string> = {
    info: "border-l-primary bg-primary/5 text-primary",
    warning: "border-l-[oklch(0.65_0.19_42)] bg-[oklch(0.65_0.19_42/0.07)] text-[oklch(0.5_0.19_42)]",
    danger: "border-l-destructive bg-destructive/5 text-destructive",
  };
  return (
    <div className={`rounded-md border border-border border-l-4 px-2.5 py-2 ${toneCls[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide">{label}</div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="mt-1 min-h-[52px] resize-y border-0 bg-transparent p-0 text-xs leading-relaxed text-foreground/85 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

/* ============================ REPORT (STEP 4) ============================ */

function Report({ result, resume, jd, criteria }: { result: EvaluationResult; resume: string; jd: string; criteria: LockedCriteria }) {
  const kw = useMemo(
    () => {
      const BANNED = new Set([
        "relevant", "strong", "good", "great", "excellent", "solid", "proven", "demonstrated",
        "significant", "extensive", "deep", "broad", "hands-on", "hands on", "expert", "expertise",
        "experienced", "experience", "skilled", "skills", "ability", "able", "knowledge",
        "understanding", "familiar", "familiarity", "working", "proficient", "proficiency",
        "quality", "successful", "effective", "excellence", "advanced", "senior", "junior",
        "required", "preferred", "must", "should", "nice", "plus", "bonus", "high", "medium", "low",
        "match", "matches", "candidate", "role", "team", "company",
      ]);
      const isAdjectivePhrase = (k: string) => {
        const t = k.trim().toLowerCase();
        if (!t) return true;
        if (BANNED.has(t)) return true;
        if (!t.includes(" ") && /(ly|ive|ous|able|ible|ent|ant)$/.test(t)) return true;
        return false;
      };

      // 1) Keywords from the AI evaluation
      const fromAI = result.rubric_keywords || [];

      // 2) Keywords derived from the recruiter-locked criteria (guardrails, weightages, critical reqs)
      const criteriaText = [
        ...(criteria.guardrails || []).flatMap((g) => [g.name, g.explanation]),
        ...(criteria.weightages || []).map((w) => w.label),
        ...(criteria.critical_requirements || []),
      ].filter(Boolean).join(" \n ");

      // 3) Tool / tech / proper-noun mining from JD + criteria text
      const source = `${criteriaText}\n${jd || ""}`;
      const mined = new Set<string>();

      // Acronyms: 2-6 uppercase letters/digits (AWS, SQL, GTM, B2B, SaaS, API, KPI, CRM, ERP)
      for (const m of source.matchAll(/\b([A-Z][A-Z0-9]{1,5})\b/g)) mined.add(m[1]);

      // Tech tokens with symbols/case: React, Node.js, TypeScript, Next.js, C++, C#, .NET, Kubernetes, PostgreSQL
      for (const m of source.matchAll(/\b([A-Z][a-zA-Z0-9]*(?:[.+#][A-Za-z0-9]+)+|[A-Z][a-zA-Z]{2,}(?:[A-Z][a-zA-Z]*)+|\.NET|C\+\+|C#)\b/g)) {
        mined.add(m[0]);
      }

      // Capitalized proper nouns 1-3 words (Salesforce, HubSpot, Google Cloud, Adobe Analytics)
      for (const m of source.matchAll(/\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]+){0,2})\b/g)) {
        mined.add(m[1]);
      }

      // Quoted / parenthetical tool lists e.g. "(Figma, Sketch, Zeplin)"
      for (const m of source.matchAll(/[(,/]\s*([A-Za-z][A-Za-z0-9.+#-]{1,24})\s*(?=[,)])/g)) {
        if (/[A-Z]/.test(m[1]) || /[.+#]/.test(m[1])) mined.add(m[1]);
      }

      // 4) Merge, dedupe (case-insensitive), filter generic/banned
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const raw of [...fromAI, ...Array.from(mined)]) {
        const t = raw.trim();
        if (!t || t.length < 2) continue;
        if (isAdjectivePhrase(t)) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(t);
      }
      // Longer phrases first so highlighting prefers multi-word matches
      return merged.sort((a, b) => b.length - a.length);
    },
    [result.rubric_keywords, criteria, jd],
  );
  const { matched, missing } = useMemo(() => {
    const r = resume.toLowerCase();
    const m: string[] = [], miss: string[] = [];
    for (const k of kw) {
      const t = k.trim().toLowerCase();
      if (!t) continue;
      const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      (re.test(r) ? m : miss).push(k);
    }
    return { matched: m, missing: miss };
  }, [kw, resume]);
  const matchedSet = useMemo(() => new Set(matched.map((k) => k.toLowerCase())), [matched]);
  const missingSet = useMemo(() => new Set(missing.map((k) => k.toLowerCase())), [missing]);

  const [feedback, setFeedback] = useState<"yes" | "partially" | "no" | null>(null);
  const pickFeedback = (v: "yes" | "partially" | "no") => {
    if (feedback === v) return;
    setFeedback(v);
    track("agreement", { agreement: v });
  };

  return (
    <div className="space-y-6">
      <DecisionHero result={result} />

      <ReportCard icon={<FileText className="h-4 w-4" />} title="Candidate Summary" full>
        <p className="text-sm leading-relaxed text-foreground/90">
          <HL text={result.candidate_summary} keywords={kw} matched={matchedSet} missing={missingSet} />
        </p>
      </ReportCard>

      <SectionGrid>
        <ReportCard icon={<Scale className="h-4 w-4" />} title="Key Insights">
          <SubList title="Strengths" tone="success" items={result.strengths} kw={kw} matched={matchedSet} missing={missingSet} />
          <SubList title="Concerns" tone="warning" items={result.tradeoffs} kw={kw} matched={matchedSet} missing={missingSet} />
        </ReportCard>
        <ReportCard icon={<AlertOctagon className="h-4 w-4" />} title="Risk Alerts & Missing Requirements">
          <SubList title="Risk Alerts" tone="destructive" items={result.risk_alerts} kw={kw} matched={matchedSet} missing={missingSet} />
          <SubList title="Missing Requirements" tone="destructive" items={result.missing_requirements} kw={kw} matched={matchedSet} missing={missingSet} />
        </ReportCard>
      </SectionGrid>

      <ReportCard icon={<MessageSquareQuote className="h-4 w-4" />} title="Deeper Interview Intelligence" full>
        <div className="space-y-3">
          {(result.interview_questions || []).map((q, i) => (
            <details key={i} className="group rounded-lg border border-border/60 bg-card px-4 py-3 open:shadow-[var(--shadow-card)]">
              <summary className="flex cursor-pointer items-start justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <div className="flex-1"><HL text={q.question} keywords={kw} matched={matchedSet} missing={missingSet} /></div>
                <Badge variant="secondary" className="shrink-0 text-[10px]">{q.category}</Badge>
              </summary>
              <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
                <Field label="Why it matters" text={q.why_matters} kw={kw} matched={matchedSet} missing={missingSet} />
                <Field label="Strong answer" text={q.strong_answer} kw={kw} matched={matchedSet} missing={missingSet} />
                <Field label="Risk signal" text={q.risk_signal} kw={kw} matched={matchedSet} missing={missingSet} />
              </div>
            </details>
          ))}
        </div>
      </ReportCard>

      <ReportCard icon={<Target className="h-4 w-4" />} title="Guardrail Evaluation" full>
        <GuardrailTable guardrails={result.guardrails} kw={kw} matched={matchedSet} missing={missingSet} />
      </ReportCard>

      <ReportCard icon={<Calculator className="h-4 w-4" />} title="Score Calculation" full>
        <ScoreBreakdown result={result} />
      </ReportCard>

      <ReportCard icon={<Brain className="h-4 w-4" />} title="AI Self-Audit" full>
        <div className="grid gap-6 md:grid-cols-3">
          <SubList title="Assumptions Made" tone="info" items={result.assumptions} kw={kw} matched={matchedSet} missing={missingSet} dense />
          <SubList title="Missing Information" tone="warning" items={result.missing_information} kw={kw} matched={matchedSet} missing={missingSet} dense />
          <SubList title="Verification Needed" tone="info" items={result.verification_needed} kw={kw} matched={matchedSet} missing={missingSet} dense />
        </div>
      </ReportCard>

      <ReportCard icon={<MessageSquareQuote className="h-4 w-4" />} title="Did you agree with the recommendation?" full>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Button
              variant={feedback === "yes" ? "default" : "outline"}
              size="sm"
              onClick={() => pickFeedback("yes")}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" /> Yes
            </Button>
            <Button
              variant={feedback === "partially" ? "default" : "outline"}
              size="sm"
              onClick={() => pickFeedback("partially")}
              className="gap-2"
            >
              <AlertTriangle className="h-4 w-4" /> Partially
            </Button>
            <Button
              variant={feedback === "no" ? "destructive" : "outline"}
              size="sm"
              onClick={() => pickFeedback("no")}
              className="gap-2"
            >
              <XCircle className="h-4 w-4" /> No
            </Button>
          </div>
          {feedback && (
            <p className="text-sm text-muted-foreground">
              {feedback === "yes" && "Thanks — the evaluation matched your view."}
              {feedback === "partially" && "Noted — some parts matched, but the full picture needs a second look."}
              {feedback === "no" && "Thanks — your feedback will help tune the rubric and catch blind spots."}
            </p>
          )}
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
              <Shield className="h-3.5 w-3.5" /> Candidate Snapshot
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
        <circle cx="48" cy="48" r={r} stroke="white" strokeWidth="8" fill="none" strokeLinecap="round"
                strokeDasharray={`${dash} ${c - dash}`} />
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

function GuardrailTable({ guardrails, kw, matched, missing }: { guardrails: GuardrailEval[]; kw: string[]; matched: Set<string>; missing: Set<string> }) {
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
              <td className="px-3 py-3 font-medium">{g.requirement}</td>
              <td className="px-3 py-3 text-muted-foreground">{g.weight}%</td>
              <td className="px-3 py-3"><MatchBadge status={g.match_status} /></td>
              <td className="px-3 py-3">
                <div className="font-mono text-xs">{g.contribution.toFixed(1)} pts</div>
                <Progress value={g.weight ? (g.contribution / g.weight) * 100 : 0} className="mt-1 h-1.5" />
              </td>
              <td className="px-3 py-3 text-xs text-foreground/80">
                <div className="mb-1.5 font-medium text-foreground">Explanation</div>
                <ul className="mb-2 list-inside list-disc space-y-0.5">
                  {g.explanation?.map((e, j) => <li key={j}><HL text={e} keywords={kw} matched={matched} missing={missing} /></li>)}
                </ul>
                <div className="mb-1.5 font-medium text-foreground">Evidence</div>
                <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                  {g.evidence?.map((e, j) => <li key={j}><HL text={e} keywords={kw} matched={matched} missing={missing} /></li>)}
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
                <div className="h-full rounded-full" style={{ width: `${g.contribution}%`, background: "var(--gradient-primary)" }} />
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

function ReportCard({ icon, title, children, full }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; full?: boolean;
}) {
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

function SubList({ title, tone, items, kw, matched, missing, dense }: {
  title: string; tone: "success" | "warning" | "destructive" | "info"; items?: string[]; kw: string[]; matched: Set<string>; missing: Set<string>; dense?: boolean;
}) {
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
            <span><HL text={s} keywords={kw} matched={matched} missing={missing} /></span>
          </li>
        ))}
        {!items?.length && <li className="text-xs text-muted-foreground">None.</li>}
      </ul>
    </div>
  );
}

function Field({ label, text, kw, matched, missing }: { label: string; text: string; kw: string[]; matched: Set<string>; missing: Set<string> }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/70">{label}</div>
      <div className="text-xs leading-relaxed"><HL text={text} keywords={kw} matched={matched} missing={missing} /></div>
    </div>
  );
}

function HL({ text, keywords, matched, missing }: { text: string; keywords: string[]; matched?: Set<string>; missing?: Set<string> }) {
  if (!text) return null;
  if (!keywords?.length) return <>{text}</>;
  const escaped = keywords.map((k) => k.trim()).filter((k) => k.length > 1)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return <>{text}</>;
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const set = new Set(keywords.map((k) => k.toLowerCase()));
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => {
        const lower = p.toLowerCase();
        if (!set.has(lower)) return <span key={i}>{p}</span>;
        const tone = matched?.has(lower) ? "rubric-kw--match"
          : missing?.has(lower) ? "rubric-kw--miss" : "";
        return <span key={i} className={`rubric-kw ${tone}`}>{p}</span>;
      })}
    </>
  );
}
