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

async function callGroq(system: string, user: string) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("GROQ_API_KEY is not configured.");

  // Groq free tier caps `llama-3.1-8b-instant` at 6000 TPM. Trim the user
  // payload so prompt + completion stay safely under that ceiling.
  // ~4 chars/token => 12000 chars ≈ 3000 tokens of user content.
  const MAX_USER_CHARS = 3500;
  const trimmedUser =
    user.length > MAX_USER_CHARS
      ? user.slice(0, MAX_USER_CHARS) + "\n\n[TRUNCATED]"
      : user;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      max_tokens: 3500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: trimmedUser },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 500)}`);
  }
  const payload = (await res.json()) as { choices: { message: { content: string } }[] };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Model did not return JSON.");
  return JSON.parse(jsonMatch[0]);
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
    const out = await callGroq(ANALYZE_SYSTEM, `JOB DESCRIPTION:\n${data.jd}\n\nReturn the JSON object now.`);
    return out as JDAnalysis;
  });

/* ============================== EVALUATE RESUME ============================== */

const EVAL_SYSTEM = `You are an Explainable Resume Evaluation Assistant. The recruiter has LOCKED a hiring rubric (guardrails, weightage buckets, critical requirements). You MUST use this exact rubric — do not invent new guardrails and do not change weightages.

Process:
1. Evaluate the resume against EACH locked guardrail using ONLY evidence explicitly present in the resume. Never infer missing experience.
2. Map each guardrail to one of the 5 weightage buckets (skills_match, experience_match, domain_relevance, critical_requirements, risk_factors) and distribute that bucket's weight across guardrails mapped to it. The "weight" you report per guardrail must equal its share of its bucket weight; the sum of ALL guardrail weights must equal 100.
3. Score each guardrail: Strong Match=100%, Partial Match=60%, Weak Match=30%, No Evidence=0% of its weight. contribution = weight * factor.
4. match_score = sum of contributions, rounded to nearest integer.
5. Decision: >=80 Strong Proceed, 70-79 Proceed with Review, 50-69 Manual Review Required, <50 Unlikely Fit. Missing any critical requirement => Unlikely Fit regardless of score. Ambiguous evidence => Manual Review Required.
6. Generate EXACTLY 5 recommended recruiter screening questions. Prioritize: missing evidence, weak matches, risk alerts, critical requirements, decision-changing information. For each, include "why" explaining why this question is being asked.
7. Also generate 6-10 deeper interview questions across categories: Ownership, Decision-Making, Problem Solving, Impact Validation, Stakeholder Management, Domain Expertise, Risk Areas, Growth Potential.
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
    const criteriaText = JSON.stringify(data.criteria, null, 2);
    const user = `JOB DESCRIPTION:\n${data.jd}\n\n---\n\nRECRUITER-LOCKED CRITERIA (use exactly this rubric):\n${criteriaText}\n\n---\n\nRESUME:\n${data.resume}\n\nReturn the JSON object now.`;
    const out = await callGroq(EVAL_SYSTEM, user);
    return out as EvaluationResult;
  });
