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
      const payload = (await res.json()) as { choices: { message: { content: string } }[] };
      const raw = payload.choices?.[0]?.message?.content ?? "";
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

const EVAL_SYSTEM = `You are an Explainable Resume Evaluation Assistant. The recruiter has LOCKED a hiring rubric (guardrails, weightage buckets, critical requirements). You MUST use this exact rubric — do not invent new guardrails and do not change weightages.

Keep the JSON compact. Use short phrases and one-sentence explanations. Evidence arrays must contain only exact or near-exact resume snippets. Do not include markdown.

Process:
1. Evaluate the resume against EACH locked guardrail using ONLY evidence explicitly present in the resume. Never infer missing experience.
2. Map each guardrail to one of the 5 weightage buckets (skills_match, experience_match, domain_relevance, critical_requirements, risk_factors) and distribute that bucket's weight across guardrails mapped to it. The "weight" you report per guardrail must equal its share of its bucket weight; the sum of ALL guardrail weights must equal 100.
3. Score each guardrail: Strong Match=100%, Partial Match=60%, Weak Match=30%, No Evidence=0% of its weight. contribution = weight * factor.
4. match_score = sum of contributions, rounded to nearest integer.
5. Decision: >=80 Strong Proceed, 70-79 Proceed with Review, 50-69 Manual Review Required, <50 Unlikely Fit. Missing any critical requirement => Unlikely Fit regardless of score. Ambiguous evidence => Manual Review Required.
6. Set top_5_questions to an empty array.
7. Generate exactly 5 deeper interview questions across the most relevant categories.
8. In score_calculation, explain CLEARLY how the recruiter-locked guardrails and weightages produced the final decision.

Return STRICT JSON ONLY, no markdown:
{
  "decision": "Strong Proceed"|"Proceed with Review"|"Manual Review Required"|"Unlikely Fit",
  "match_score": number,
  "confidence": "High"|"Medium"|"Low",
  "description": string,
  "candidate_summary": string,
  "guardrails": [{ "requirement": string, "weight": number, "match_status": "Strong Match"|"Partial Match"|"Weak Match"|"No Evidence", "contribution": number, "explanation": string[], "evidence": string[] }],
  "critical_requirements": [{ "requirement": string, "met": boolean, "note": string }],
  "score_calculation": string,
  "strengths": string[],
  "missing_requirements": string[],
  "tradeoffs": string[],
  "risk_alerts": string[],
  "assumptions": string[],
  "missing_information": string[],
  "verification_needed": string[],
  "interview_questions": [{ "question": string, "category": string, "why_matters": string, "strong_answer": string, "risk_signal": string }],
  "top_5_questions": [{ "question": string, "why": string }],
  "rubric_keywords": string[]
}`;

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
        explanation: truncateText(g.explanation, 180),
        importance: g.importance,
      })),
      weightages: data.criteria.weightages.map((w) => ({
        label: truncateText(w.label, 90),
        weight: w.weight,
      })),
      critical_requirements: data.criteria.critical_requirements.map((r) => truncateText(r, 120)),
    };
    const user = `JD:\n${truncateText(data.jd, 900)}\n\nLOCKED_CRITERIA_JSON:\n${JSON.stringify(compactCriteria)}\n\nRESUME:\n${truncateText(data.resume, 2600)}\n\nReturn only the JSON object.`;
    const out = await callGroq(EVAL_SYSTEM, user, { maxTokens: 1900, maxUserChars: 5200, retries: 1 });
    return out as EvaluationResult;
  });
