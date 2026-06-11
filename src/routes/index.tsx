import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  analyzeJD,
  evaluateResume,
  type EvaluationResult,
  type GuardrailEval,
  type JDAnalysis,
  type LockedCriteria,
  type SuggestedGuardrail,
  type WeightageBucket,
} from "@/lib/evaluate.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  FileText, Sparkles, Loader2, CheckCircle2, AlertTriangle, XCircle,
  Shield, Target, Scale, AlertOctagon, Brain, MessageSquareQuote, Calculator,
  ArrowRight, ArrowLeft, Upload, Lock, Plus, Trash2, RotateCcw, Wand2,
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

interface EditableGuardrail extends SuggestedGuardrail {
  enabled: boolean;
  custom?: boolean;
}

function Index() {
  const [step, setStep] = useState<Step>(1);

  const [jd, setJd] = useState("");
  const [resume, setResume] = useState("");

  const [analysis, setAnalysis] = useState<JDAnalysis | null>(null);
  const [guardrails, setGuardrails] = useState<EditableGuardrail[]>([]);
  const [weights, setWeights] = useState<WeightageBucket[]>([]);
  const [criticalReqs, setCriticalReqs] = useState<string[]>([]);

  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useServerFn(analyzeJD);
  const evaluate = useServerFn(evaluateResume);

  const onAnalyzeJD = async () => {
    setError(null); setLoading(true);
    try {
      const a = await analyze({ data: { jd } });
      setAnalysis(a);
      setGuardrails(a.suggested_guardrails.map((g) => ({ ...g, enabled: true })));
      setWeights(a.recommended_weightages.map((w) => ({ ...w })));
      setCriticalReqs([...a.critical_requirements]);
      setStep(2);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const lockedCriteria: LockedCriteria = useMemo(() => ({
    guardrails: guardrails.filter((g) => g.enabled).map((g) => ({
      name: g.name, explanation: g.explanation, importance: g.importance,
    })),
    weightages: weights.map((w) => ({ label: w.label, weight: w.weight })),
    critical_requirements: criticalReqs,
  }), [guardrails, weights, criticalReqs]);

  const totalWeight = weights.reduce((s, w) => s + (Number(w.weight) || 0), 0);
  const activeGuardrails = guardrails.filter((g) => g.enabled).length;

  const onEvaluate = async () => {
    setError(null); setLoading(true);
    try {
      const r = await evaluate({ data: { jd, resume, criteria: lockedCriteria } });
      setResult(r);
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
            onBack={() => setStep(1)}
            onLock={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <Step3
            resume={resume} setResume={setResume}
            activeGuardrails={activeGuardrails}
            weights={weights}
            criticalCount={criticalReqs.length}
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
              <Button variant="outline" size="sm" onClick={reset} className="gap-2">
                <RotateCcw className="h-4 w-4" /> New evaluation
              </Button>
            </div>
            <Report result={result} />
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
    const text = await f.text();
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
            <Upload className="h-3.5 w-3.5" /> Upload .txt / .md
            <input type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden"
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
  criticalReqs, setCriticalReqs, totalWeight, onBack, onLock,
}: {
  analysis: JDAnalysis;
  guardrails: EditableGuardrail[];
  setGuardrails: (g: EditableGuardrail[]) => void;
  weights: WeightageBucket[];
  setWeights: (w: WeightageBucket[]) => void;
  criticalReqs: string[];
  setCriticalReqs: (c: string[]) => void;
  totalWeight: number;
  onBack: () => void;
  onLock: () => void;
}) {
  const valid = totalWeight === 100 && guardrails.some((g) => g.enabled);

  const updateGuardrail = (id: string, patch: Partial<EditableGuardrail>) =>
    setGuardrails(guardrails.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const deleteGuardrail = (id: string) =>
    setGuardrails(guardrails.filter((g) => g.id !== id));
  const addGuardrail = () =>
    setGuardrails([...guardrails, {
      id: `c${Date.now()}`, name: "New guardrail", explanation: "", importance: "Medium",
      enabled: true, custom: true,
    }]);

  const updateWeight = (key: WeightageBucket["key"], w: number) =>
    setWeights(weights.map((b) => (b.key === key ? { ...b, weight: Math.max(0, Math.min(100, w)) } : b)));
  const resetWeights = () =>
    setWeights(analysis.recommended_weightages.map((w) => ({ ...w })));

  return (
    <div className="mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Edit JD
        </Button>
        <Badge variant="secondary" className="gap-1"><Brain className="h-3 w-3" /> Step 2 of 4</Badge>
      </div>

      <SectionCard icon={<FileText className="h-4 w-4" />} title="Role Summary">
        <p className="text-sm leading-relaxed text-foreground/90">{analysis.role_summary}</p>
      </SectionCard>

      <SectionCard icon={<Shield className="h-4 w-4" />} title="Critical Requirements">
        <div className="space-y-2">
          {criticalReqs.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input value={r} onChange={(e) => {
                const next = [...criticalReqs]; next[i] = e.target.value; setCriticalReqs(next);
              }} className="text-sm" />
              <Button variant="ghost" size="icon" onClick={() => setCriticalReqs(criticalReqs.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setCriticalReqs([...criticalReqs, ""])} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Add critical requirement
          </Button>
        </div>
      </SectionCard>

      <SectionCard icon={<Target className="h-4 w-4" />} title="Suggested Guardrails"
        action={<Button variant="outline" size="sm" onClick={addGuardrail} className="gap-2">
          <Plus className="h-3.5 w-3.5" /> Add guardrail
        </Button>}>
        <div className="space-y-3">
          {guardrails.map((g) => (
            <div key={g.id} className={`rounded-lg border bg-card p-3 ${g.enabled ? "border-border" : "border-border/40 opacity-60"}`}>
              <div className="flex items-start gap-3">
                <Switch checked={g.enabled} onCheckedChange={(v) => updateGuardrail(g.id, { enabled: v })} className="mt-1" />
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input value={g.name} onChange={(e) => updateGuardrail(g.id, { name: e.target.value })}
                           className="h-8 max-w-md text-sm font-medium" />
                    <ImportanceSelector value={g.importance} onChange={(v) => updateGuardrail(g.id, { importance: v })} />
                    {g.custom && <Badge variant="secondary" className="text-[10px]">Custom</Badge>}
                  </div>
                  <Textarea value={g.explanation} onChange={(e) => updateGuardrail(g.id, { explanation: e.target.value })}
                            className="min-h-[60px] text-xs" placeholder="Explanation…" />
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteGuardrail(g.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard icon={<Scale className="h-4 w-4" />} title="Recommended Evaluation Weightages"
        action={<Button variant="outline" size="sm" onClick={resetWeights} className="gap-2">
          <RotateCcw className="h-3.5 w-3.5" /> Reset to AI
        </Button>}>
        <div className="space-y-3">
          {weights.map((w) => (
            <div key={w.key} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-medium">{w.label}</div>
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} max={100} value={w.weight}
                         onChange={(e) => updateWeight(w.key, parseInt(e.target.value || "0", 10))}
                         className="h-8 w-20 text-right text-sm" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <Progress value={w.weight} className="mt-2 h-1.5" />
              <p className="mt-2 text-xs text-muted-foreground">{w.rationale}</p>
            </div>
          ))}
          <div className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
            totalWeight === 100 ? "border-[oklch(0.62_0.16_155/0.4)] bg-[oklch(0.62_0.16_155/0.08)]"
            : "border-destructive/40 bg-destructive/5 text-destructive"
          }`}>
            <span className="font-medium">Total weightage</span>
            <span className="font-mono font-semibold">{totalWeight} / 100 %</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={<Lock className="h-4 w-4" />} title="Final Evaluation Criteria Summary">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected Guardrails ({guardrails.filter(g => g.enabled).length})</div>
            <ul className="space-y-1 text-sm">
              {guardrails.filter((g) => g.enabled).map((g) => (
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
                  <span>{w.label}</span>
                  <span className="font-mono text-xs">{w.weight}%</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="sm:col-span-2">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Critical Requirements ({criticalReqs.length})</div>
            <ul className="space-y-1 text-sm">
              {criticalReqs.filter(Boolean).map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {r}
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
        {!valid && <p className="text-xs text-destructive">
          {totalWeight !== 100 ? `Weightages must total exactly 100% (currently ${totalWeight}%).` : "Enable at least one guardrail."}
        </p>}
      </div>
    </div>
  );
}

function ImportanceSelector({ value, onChange }: {
  value: "High" | "Medium" | "Low"; onChange: (v: "High" | "Medium" | "Low") => void;
}) {
  const opts: ("High" | "Medium" | "Low")[] = ["High", "Medium", "Low"];
  const tone: Record<string, string> = {
    High: "bg-destructive/10 text-destructive border-destructive/30",
    Medium: "bg-[oklch(0.75_0.16_75/0.15)] text-[oklch(0.45_0.16_70)] border-[oklch(0.75_0.16_75/0.35)]",
    Low: "bg-muted text-muted-foreground border-border",
  };
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {opts.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
                className={`px-2 py-0.5 text-[11px] font-medium ${value === o ? tone[o] : "text-muted-foreground hover:bg-muted"}`}>
          {o}
        </button>
      ))}
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
    const text = await f.text();
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
                {w.label} <span className="font-mono font-semibold">{w.weight}%</span>
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
            <Upload className="h-3.5 w-3.5" /> Upload .txt / .md
            <input type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden"
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

/* ============================ REPORT (STEP 4) ============================ */

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
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "oklch(0.62 0.16 155)" }} />
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

      <SectionGrid>
        <ReportCard icon={<Scale className="h-4 w-4" />} title="Key Insights">
          <SubList title="Strengths" tone="success" items={result.strengths} kw={kw} />
          <SubList title="Concerns" tone="warning" items={result.tradeoffs} kw={kw} />
        </ReportCard>
        <ReportCard icon={<AlertOctagon className="h-4 w-4" />} title="Risk Alerts & Missing Requirements">
          <SubList title="Risk Alerts" tone="destructive" items={result.risk_alerts} kw={kw} />
          <SubList title="Missing Requirements" tone="destructive" items={result.missing_requirements} kw={kw} />
        </ReportCard>
      </SectionGrid>

      <ReportCard icon={<MessageSquareQuote className="h-4 w-4" />} title="Recommended Screening Questions (Top 5)" full>
        <ol className="space-y-3 text-sm">
          {(result.top_5_questions || []).map((q, i) => (
            <li key={i} className="rounded-lg border border-border/60 bg-card px-4 py-3">
              <div className="flex gap-3">
                <span className="font-mono text-xs text-primary">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1 space-y-1.5">
                  <div className="font-medium"><HL text={q.question} keywords={kw} /></div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground/80">Why: </span>
                    <HL text={q.why} keywords={kw} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </ReportCard>

      <ReportCard icon={<Target className="h-4 w-4" />} title="Guardrail Evaluation" full>
        <GuardrailTable guardrails={result.guardrails} kw={kw} />
      </ReportCard>

      <ReportCard icon={<Calculator className="h-4 w-4" />} title="Score Calculation" full>
        <ScoreBreakdown result={result} />
      </ReportCard>

      <ReportCard icon={<Brain className="h-4 w-4" />} title="AI Self-Audit" full>
        <div className="grid gap-6 md:grid-cols-3">
          <SubList title="Assumptions Made" tone="info" items={result.assumptions} kw={kw} dense />
          <SubList title="Missing Information" tone="warning" items={result.missing_information} kw={kw} dense />
          <SubList title="Verification Needed" tone="info" items={result.verification_needed} kw={kw} dense />
        </div>
      </ReportCard>

      <ReportCard icon={<MessageSquareQuote className="h-4 w-4" />} title="Deeper Interview Intelligence" full>
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
                <Progress value={g.weight ? (g.contribution / g.weight) * 100 : 0} className="mt-1 h-1.5" />
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

function SubList({ title, tone, items, kw, dense }: {
  title: string; tone: "success" | "warning" | "destructive" | "info"; items?: string[]; kw: string[]; dense?: boolean;
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

function HL({ text, keywords }: { text: string; keywords: string[] }) {
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
      {parts.map((p, i) =>
        set.has(p.toLowerCase()) ? <span key={i} className="rubric-kw">{p}</span> : <span key={i}>{p}</span>,
      )}
    </>
  );
}
