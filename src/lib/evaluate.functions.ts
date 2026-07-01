import { createServerFn } from "@tanstack/react-start";

/* ============================== TYPES ============================== */

export interface SuggestedGuardrail {
  id: string;
  name: string;
  explanation: string;
  importance: "High" | "Medium" | "Low";
  reason?: string;
  risk_if_ignored?: string;
}

export interface WeightageBucket {
  key: string;
  guardrail_requirement: string;
  weight: number;
  rationale: string;
}

export interface CriticalRequirement {
  requirement: string;
  why_critical: string;
  impact: string;
}

export interface JDAnalysis {
  role_summary: string;
  critical_requirements: CriticalRequirement[];
  suggested_guardrails: SuggestedGuardrail[];
  recommended_weightages: WeightageBucket[];
}

export interface LockedCriteria {
  guardrails: { name: string; explanation: string; importance: "High" | "Medium" | "Low" }[];
  weightages: { label: string; weight: number }[];
  critical_requirements: string[];
}

export interface GuardrailEval {
  requirement: string;
  weight: number;
  match_status: "Strong Match" | "Partial Match" | "Weak Match" | "No Evidence";
  contribution: number;
  explanation: string[];
  evidence: string[];
}

export interface EvaluationResult {
  decision: "Strong Proceed" | "Proceed with Review" | "Manual Review Required" | "Unlikely Fit";
  match_score: number;
  confidence: "High" | "Medium" | "Low";
  description: string;
  candidate_summary: string;
  guardrails: GuardrailEval[];
  critical_requirements: { requirement: string; met: boolean; note: string }[];
  score_calculation: string;
  strengths: string[];
  missing_requirements: string[];
  tradeoffs: string[];
  risk_alerts: string[];
  assumptions: string[];
  missing_information: string[];
  verification_needed: string[];
  interview_questions: {
    question: string;
    category: string;
    why_matters: string;
    strong_answer: string;
    risk_signal: string;
  }[];
  top_5_questions: { question: string; why: string }[];
  rubric_keywords: string[];
}

/* ============================== GROQ ============================== */

type GroqCallOptions = {
  maxTokens: number;
  maxUserChars: number;
  retries?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.7);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[CONTENT TRUNCATED TO FIT PROVIDER TOKEN LIMIT]\n\n${text.slice(-tail)}`;
}

function retrySecondsFromGroqError(text: string) {
  const match = text.match(/try again in\s+([\d.]+)s/i);
  return match ? Math.ceil(Number(match[1])) : null;
}

function toFriendlyGroqError(status: number, text: string) {
  if (status === 429) {
    return "The AI provider is temporarily rate-limiting this workspace. I reduced the request size and retried, but it is still over the current token-per-minute limit. Please wait about 30 seconds and try again.";
  }
  if (status === 413) {
    return "The JD or resume is too large for the current AI token limit. Please shorten the pasted text or upload a smaller document.";
  }
  if (status === 400 && text.includes("json_validate_failed")) {
    return "The AI response was cut off before the evaluation JSON could finish. Please try again with fewer approved guardrails or a shorter resume.";
  }
  return `AI provider error ${status}: ${text.slice(0, 240)}`;
}

async function callGroq(system: string, user: string, options: GroqCallOptions) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("GROQ_API_KEY is not configured.");

  const trimmedUser =
    user.length > options.maxUserChars
      ? truncateText(user, options.maxUserChars)
      : user;

  const retries = options.retries ?? 1;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.1,
        max_tokens: options.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: trimmedUser },
        ],
      }),
    });

    if (res.ok) {
      const payload = (await res.json()) as { choices: { finish_reason?: string; message: { content: string } }[] };
      const choice = payload.choices?.[0];
      if (choice?.finish_reason === "length") {
        throw new Error("The AI response was cut off before the evaluation could finish. Please try again with fewer approved guardrails or a shorter resume.");
      }
      const raw = choice?.message?.content ?? "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Model did not return JSON.");
      return JSON.parse(jsonMatch[0]);
    }

    const text = await res.text();
    if (res.status === 429 && attempt < retries) {
      const retryAfterHeader = Number(res.headers.get("retry-after") ?? "");
      const retrySeconds = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader
        : retrySecondsFromGroqError(text) ?? 30;
      await sleep(Math.min(retrySeconds * 1000 + 750, 35_000));
      continue;
    }

    throw new Error(toFriendlyGroqError(res.status, text));
  }

  throw new Error("AI provider request failed after retrying.");
}

/* ============================== ANALYZE JD ============================== */

const ANALYZE_SYSTEM = `You are an Explainable Hiring Rubric Designer. Given ONLY a Job Description, derive:

1. A concise role summary (2-3 sentences).
2. Critical (non-negotiable) requirements. For each: a short "requirement" string, a 1-sentence "why_critical" explanation, and a 1-sentence "impact" describing how missing it changes the hiring decision.
3. 5-8 suggested guardrails. For each: a name (3-6 words), a 1-2 sentence explanation, importance (High|Medium|Low), a "reason" (why this guardrail matters for THIS role), and a "risk_if_ignored" (what could go wrong if it is skipped).
4. Recommended evaluation weightages across these FIVE fixed buckets (must sum to exactly 100):
   - skills_match
   - experience_match
   - domain_relevance
   - critical_requirements
   - risk_factors
   For each bucket include a short "guardrail_requirement" description (5-12 words summarizing what is being weighted), an integer "weight" (0-100), and a "rationale" (1 sentence explaining why this weighting fits THIS role).

Return STRICT JSON ONLY, no markdown:
{
  "role_summary": string,
  "critical_requirements": [{ "requirement": string, "why_critical": string, "impact": string }],
  "suggested_guardrails": [{ "id": string, "name": string, "explanation": string, "importance": "High"|"Medium"|"Low", "reason": string, "risk_if_ignored": string }],
  "recommended_weightages": [
    { "key": "skills_match", "guardrail_requirement": string, "weight": number, "rationale": string },
    { "key": "experience_match", "guardrail_requirement": string, "weight": number, "rationale": string },
    { "key": "domain_relevance", "guardrail_requirement": string, "weight": number, "rationale": string },
    { "key": "critical_requirements", "guardrail_requirement": string, "weight": number, "rationale": string },
    { "key": "risk_factors", "guardrail_requirement": string, "weight": number, "rationale": string }
  ]
}

Rules:
- Weightages MUST sum to exactly 100.
- Use evidence from the JD only; never invent requirements.
- Guardrail IDs are short slugs like "g1", "g2", ...`;

export const analyzeJD = createServerFn({ method: "POST" })
  .inputValidator((data: { jd: string }) => {
    if (!data?.jd?.trim()) throw new Error("Job Description is required.");
    return data;
  })
  .handler(async ({ data }): Promise<JDAnalysis> => {
    const out = await callGroq(
      ANALYZE_SYSTEM,
      `JOB DESCRIPTION:\n${truncateText(data.jd, 2800)}\n\nReturn the JSON object now.`,
      { maxTokens: 1600, maxUserChars: 3200, retries: 1 },
    );
    return out as JDAnalysis;
  });

/* ============================== EVALUATE RESUME ============================== */

const EVAL_SYSTEM = `Evaluate a resume against recruiter-locked guardrails using only resume evidence. Never infer missing facts.

Return compact STRICT JSON ONLY with these short keys:
{
 "d":"Strong Proceed|Proceed with Review|Manual Review Required|Unlikely Fit",
 "s":0-100,
 "c":"High|Medium|Low",
 "desc":"one short sentence",
 "sum":"one short candidate summary sentence",
 "g":[{"r":"guardrail name","w":number,"st":"Strong Match|Partial Match|Weak Match|No Evidence","con":number,"ex":"one short reason","ev":"short resume quote or No direct evidence"}],
 "calc":"one sentence explaining how locked weights affected decision",
 "str":["max 3 short strengths"],
 "miss":["max 3 missing requirements"],
 "risk":["max 3 risks"],
 "gap":["max 3 missing info items"],
 "verify":["max 3 verification items"],
 "q":[{"q":"question","cat":"category","why":"why it matters","strong":"strong answer signal","risk":"risk signal"}],
 "kw":["max 12 important rubric keywords"]
}

Rules:
- Include one g item for each locked guardrail, in the same order.
- Guardrail weights must sum to 100. contribution = weight * status factor (Strong 1, Partial .6, Weak .3, No Evidence 0).
- Decision: >=80 Strong Proceed, 70-79 Proceed with Review, 50-69 Manual Review Required, <50 Unlikely Fit. Missing a critical requirement means Unlikely Fit.
- Generate exactly 5 q items.
- Keep every string under 120 characters.`;

type CompactEvaluationResult = {
  d?: EvaluationResult["decision"];
  s?: number;
  c?: EvaluationResult["confidence"];
  desc?: string;
  sum?: string;
  g?: { r?: string; w?: number; st?: GuardrailEval["match_status"]; con?: number; ex?: string; ev?: string }[];
  calc?: string;
  str?: string[];
  miss?: string[];
  risk?: string[];
  gap?: string[];
  verify?: string[];
  q?: { q?: string; cat?: string; why?: string; strong?: string; risk?: string }[];
  kw?: string[];
};

function normalizeEvaluation(out: CompactEvaluationResult): EvaluationResult {
  const guardrails = (out.g ?? []).map((g): GuardrailEval => ({
    requirement: g.r || "Guardrail requirement",
    weight: Number(g.w ?? 0),
    match_status: g.st || "No Evidence",
    contribution: Number(g.con ?? 0),
    explanation: g.ex ? [g.ex] : [],
    evidence: g.ev ? [g.ev] : [],
  }));
  return {
    decision: out.d || "Manual Review Required",
    match_score: Math.max(0, Math.min(100, Math.round(Number(out.s ?? 0)))),
    confidence: out.c || "Medium",
    description: out.desc || "Evaluation completed using the locked recruiter rubric.",
    candidate_summary: out.sum || "Candidate evaluated against the approved guardrails and weightages.",
    guardrails,
    critical_requirements: [],
    score_calculation: out.calc || "Final score is based on each approved guardrail's locked weight and evidence strength.",
    strengths: out.str ?? [],
    missing_requirements: out.miss ?? [],
    tradeoffs: [],
    risk_alerts: out.risk ?? [],
    assumptions: [],
    missing_information: out.gap ?? [],
    verification_needed: out.verify ?? [],
    interview_questions: (out.q ?? []).map((q) => ({
      question: q.q || "Validate the candidate's relevant experience.",
      category: q.cat || "Validation",
      why_matters: q.why || "This confirms decision-critical evidence.",
      strong_answer: q.strong || "Provides specific, measurable examples.",
      risk_signal: q.risk || "Cannot provide concrete evidence.",
    })),
    top_5_questions: [],
    rubric_keywords: out.kw ?? [],
  };
}

export const evaluateResume = createServerFn({ method: "POST" })
  .inputValidator((data: { jd: string; resume: string; criteria: LockedCriteria }) => {
    if (!data?.jd?.trim() || !data?.resume?.trim()) throw new Error("Job Description and Resume are required.");
    if (!data?.criteria?.guardrails?.length) throw new Error("Locked criteria are required.");
    return data;
  })
  .handler(async ({ data }): Promise<EvaluationResult> => {
    const compactCriteria = {
      guardrails: data.criteria.guardrails.map((g) => ({
        name: truncateText(g.name, 80),
        explanation: truncateText(g.explanation, 120),
        importance: g.importance,
      })),
      weightages: data.criteria.weightages.map((w) => ({
        label: truncateText(w.label, 90),
        weight: w.weight,
      })),
      critical_requirements: data.criteria.critical_requirements.map((r) => truncateText(r, 120)),
    };
    const user = `JD:\n${truncateText(data.jd, 650)}\n\nLOCKED_CRITERIA_JSON:\n${JSON.stringify(compactCriteria)}\n\nRESUME:\n${truncateText(data.resume, 2200)}\n\nReturn compact JSON now.`;
    const out = await callGroq(EVAL_SYSTEM, user, { maxTokens: 2400, maxUserChars: 4600, retries: 1 });
    return normalizeEvaluation(out as CompactEvaluationResult);
  });
