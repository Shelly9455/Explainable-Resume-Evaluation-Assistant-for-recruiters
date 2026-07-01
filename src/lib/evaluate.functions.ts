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

type EvaluationItem = {
  id: string;
  label: string;
  explanation: string;
  importance: "High" | "Medium" | "Low";
  weight: number;
  weightageInfluence: string;
};

const STATUS_FACTOR: Record<GuardrailEval["match_status"], number> = {
  "Strong Match": 1,
  "Partial Match": 0.6,
  "Weak Match": 0.3,
  "No Evidence": 0,
};

const STOP_WORDS = new Set([
  "about", "above", "after", "again", "against", "all", "also", "and", "any", "are", "because", "been", "being",
  "between", "both", "business", "can", "candidate", "client", "company", "could", "demonstrated", "direct",
  "each", "either", "experience", "from", "have", "having", "into", "more", "must", "need", "needs", "not", "only",
  "other", "part", "role", "should", "skills", "than", "that", "the", "their", "then", "there", "these", "this",
  "through", "under", "using", "with", "within", "work", "years", "your",
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.7);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[CONTENT TRUNCATED TO FIT PROVIDER TOKEN LIMIT]\n\n${text.slice(-tail)}`;
}

function compactSentence(text: string, maxChars = 140) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function tokenize(text: string) {
  return Array.from(new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s-]/g, " ")
      .split(/\s+/)
      .map((t) => t.replace(/^-+|-+$/g, ""))
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t) && !/^\d+$/.test(t)),
  ));
}

function keywordPhrases(text: string, max = 10) {
  const cleaned = text.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  const chunks = cleaned
    .split(/[,;|/\n]|\s+-\s+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 4 && chunk.length <= 56);
  const tokens = tokenize(cleaned).slice(0, max);
  return Array.from(new Set([...chunks, ...tokens])).slice(0, max);
}

function countKeywordHits(text: string, keywords: string[]) {
  const lower = text.toLowerCase();
  return keywords.reduce((count, keyword) => {
    const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return count + (new RegExp(`\\b${escaped}\\b`, "i").test(lower) ? 1 : 0);
  }, 0);
}

function splitResumeSegments(resume: string) {
  const paragraphs = resume
    .split(/\n{2,}|(?<=\.)\s+(?=[A-Z])/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (paragraphs.length) return paragraphs;
  return resume
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function relevantResumeContext(resume: string, query: string, maxChars = 1800) {
  const keywords = tokenize(query);
  const segments = splitResumeSegments(resume);
  const ranked = segments
    .map((segment, index) => ({ segment, index, score: countKeywordHits(segment, keywords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected: string[] = [];
  let used = 0;
  const add = (segment: string) => {
    const clipped = compactSentence(segment, 420);
    if (used + clipped.length + 2 > maxChars) return false;
    selected.push(clipped);
    used += clipped.length + 2;
    return true;
  };

  for (const item of ranked.slice(0, 8)) add(item.segment);

  if (!selected.length) {
    add(resume.slice(0, 700));
    if (resume.length > 1400) add(resume.slice(Math.floor(resume.length / 2), Math.floor(resume.length / 2) + 500));
    if (resume.length > 900) add(resume.slice(-500));
  }

  return selected.join("\n");
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
    return "The AI provider rejected this request size. The app will automatically evaluate smaller evidence slices instead of requiring a shorter resume.";
  }
  if (status === 400 && text.includes("json_validate_failed")) {
    return "The AI provider cut off a JSON response. The app will continue using smaller evidence-based evaluation batches.";
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
        throw new Error("The AI response was cut off before the evaluation JSON could finish.");
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

const EVAL_SYSTEM = `Evaluate ONE recruiter-weighted requirement against ONLY the resume evidence provided. Never infer missing facts.

Return compact STRICT JSON ONLY:
{
 "st":"Strong Match|Partial Match|Weak Match|No Evidence",
 "ex":"one short reason tied to evidence and requirement weight",
 "ev":"one short resume quote or No direct evidence",
 "str":["max 2 short strengths"],
 "miss":["max 2 missing items"],
 "risk":["max 2 risks"],
 "gap":["max 2 missing info items"],
 "verify":["max 2 verification items"],
 "kw":["max 6 important requirement keywords"]
}

Rules:
- Keep every string under 110 characters.
- If evidence is indirect, use Partial Match or Weak Match.
- If the evidence slice does not prove the requirement, use No Evidence.`;

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

type CompactGuardrailResult = {
  st?: GuardrailEval["match_status"];
  ex?: string;
  ev?: string;
  str?: string[];
  miss?: string[];
  risk?: string[];
  gap?: string[];
  verify?: string[];
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

function normalizeWeights(items: EvaluationItem[]) {
  const total = items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  if (!items.length) return items;
  if (total <= 0) {
    const equal = Math.floor(100 / items.length);
    let remainder = 100 - equal * items.length;
    return items.map((item) => ({ ...item, weight: equal + (remainder-- > 0 ? 1 : 0) }));
  }

  const normalized = items.map((item) => ({ ...item, weight: Math.round((Number(item.weight) / total) * 100) }));
  const drift = 100 - normalized.reduce((sum, item) => sum + item.weight, 0);
  const largestIndex = normalized.reduce((best, item, index) => item.weight > normalized[best].weight ? index : best, 0);
  normalized[largestIndex] = { ...normalized[largestIndex], weight: normalized[largestIndex].weight + drift };
  return normalized;
}

function overlapScore(a: string, b: string) {
  const bTokens = new Set(tokenize(b));
  return tokenize(a).reduce((score, token) => score + (bTokens.has(token) ? 1 : 0), 0);
}

function buildEvaluationItems(criteria: LockedCriteria): EvaluationItem[] {
  const guardrails = criteria.guardrails ?? [];
  const weightages = criteria.weightages ?? [];

  if (weightages.length) {
    const items = weightages.map((weightage, index) => {
      const match = guardrails
        .map((guardrail) => ({ guardrail, score: overlapScore(weightage.label, `${guardrail.name} ${guardrail.explanation}`) }))
        .sort((a, b) => b.score - a.score)[0]?.guardrail;

      return {
        id: `w${index + 1}`,
        label: weightage.label || match?.name || `Weighted requirement ${index + 1}`,
        explanation: match?.explanation || weightage.label || "Recruiter-approved weighted hiring requirement.",
        importance: match?.importance || (weightage.weight >= 20 ? "High" : weightage.weight >= 10 ? "Medium" : "Low"),
        weight: Number(weightage.weight) || 0,
        weightageInfluence: `${Number(weightage.weight) || 0}% of the final score is assigned to this recruiter-configured requirement.`,
      } satisfies EvaluationItem;
    });
    return normalizeWeights(items);
  }

  const items = guardrails.map((guardrail, index) => ({
    id: `g${index + 1}`,
    label: guardrail.name || `Guardrail ${index + 1}`,
    explanation: guardrail.explanation || "Recruiter-approved guardrail.",
    importance: guardrail.importance,
    weight: 0,
    weightageInfluence: "No custom weight was provided; the app distributed influence evenly.",
  } satisfies EvaluationItem));
  return normalizeWeights(items);
}

function safeStatus(value?: string): GuardrailEval["match_status"] {
  if (value === "Strong Match" || value === "Partial Match" || value === "Weak Match" || value === "No Evidence") return value;
  return "No Evidence";
}

function fallbackGuardrailEvaluation(item: EvaluationItem, resume: string): CompactGuardrailResult {
  const keywords = keywordPhrases(`${item.label} ${item.explanation}`, 8);
  const hits = keywords.filter((keyword) => countKeywordHits(resume, [keyword]) > 0);
  const ratio = keywords.length ? hits.length / keywords.length : 0;
  const st: GuardrailEval["match_status"] = ratio >= 0.45
    ? "Partial Match"
    : ratio >= 0.22
      ? "Weak Match"
      : "No Evidence";

  return {
    st,
    ex: hits.length
      ? `${item.weightageInfluence} Found keyword evidence for ${hits.slice(0, 3).join(", ")}.`
      : `${item.weightageInfluence} No direct keyword evidence was found in the resume text.`,
    ev: hits.length ? `Keyword evidence: ${hits.slice(0, 4).join(", ")}` : "No direct evidence",
    str: hits.length ? [`Evidence mentions ${hits.slice(0, 2).join(" and ")}.`] : [],
    miss: st === "No Evidence" ? [`No evidence for ${item.label}.`] : [],
    risk: item.importance === "High" ? [`High-weight gap may reduce fit for ${item.label}.`] : [],
    gap: [`More proof needed for ${item.label}.`],
    verify: [`Verify ${item.label} with concrete examples.`],
    kw: keywords,
  };
}

async function evaluateOneItem(item: EvaluationItem, resume: string): Promise<CompactGuardrailResult> {
  const context = relevantResumeContext(resume, `${item.label} ${item.explanation}`, 1050);
  const user = `REQUIREMENT_JSON:${JSON.stringify({
    requirement: item.label,
    weight: item.weight,
    importance: item.importance,
    influence: item.weightageInfluence,
    definition: compactSentence(item.explanation, 180),
  })}\n\nRESUME_EVIDENCE:\n${context || "No matching resume section found."}\n\nReturn JSON now.`;

  try {
    return await callGroq(EVAL_SYSTEM, user, { maxTokens: 520, maxUserChars: 1750, retries: 1 }) as CompactGuardrailResult;
  } catch {
    return fallbackGuardrailEvaluation(item, resume);
  }
}

function buildDecision(score: number): EvaluationResult["decision"] {
  if (score >= 80) return "Strong Proceed";
  if (score >= 70) return "Proceed with Review";
  if (score >= 50) return "Manual Review Required";
  return "Unlikely Fit";
}

function uniqueLimited(items: string[], limit: number) {
  return Array.from(new Set(items.map((item) => compactSentence(item, 150)).filter(Boolean))).slice(0, limit);
}

function buildInterviewQuestions(guardrails: GuardrailEval[]) {
  const priority = [...guardrails].sort((a, b) => {
    const statusGap = STATUS_FACTOR[a.match_status] - STATUS_FACTOR[b.match_status];
    return statusGap || b.weight - a.weight;
  });

  return priority.slice(0, 5).map((guardrail) => ({
    question: `Walk me through your most relevant example for ${guardrail.requirement}.`,
    category: guardrail.match_status === "Strong Match" ? "Depth validation" : "Evidence gap",
    why_matters: `${guardrail.weight}% of the score depends on this requirement.`,
    strong_answer: "Gives a specific example with scope, actions, outcomes, and metrics.",
    risk_signal: "Gives generic claims without concrete evidence or measurable results.",
  }));
}

function assembleEvaluation(items: EvaluationItem[], parts: CompactGuardrailResult[]): EvaluationResult {
  const guardrails = items.map((item, index): GuardrailEval => {
    const part = parts[index] ?? fallbackGuardrailEvaluation(item, "");
    const matchStatus = safeStatus(part.st);
    const contribution = Number((item.weight * STATUS_FACTOR[matchStatus]).toFixed(1));
    return {
      requirement: item.label,
      weight: item.weight,
      match_status: matchStatus,
      contribution,
      explanation: [compactSentence(part.ex || `${item.weightageInfluence} Evidence was evaluated against this guardrail.`, 180)],
      evidence: [compactSentence(part.ev || "No direct evidence", 180)],
    };
  });

  const score = Math.max(0, Math.min(100, Number(guardrails.reduce((sum, g) => sum + g.contribution, 0).toFixed(1))));
  const decision = buildDecision(score);
  const highWeightGaps = guardrails.filter((g) => g.weight >= 15 && g.match_status !== "Strong Match");
  const strongMatches = guardrails.filter((g) => g.match_status === "Strong Match");
  const partialMatches = guardrails.filter((g) => g.match_status === "Partial Match");

  return {
    decision,
    match_score: Math.round(score),
    confidence: guardrails.some((g) => g.match_status === "No Evidence") ? "Medium" : "High",
    description: `Decision reflects ${guardrails.length} recruiter-approved weighted requirements totaling 100%.`,
    candidate_summary: `${decision}: ${score.toFixed(1)} points from recruiter-configured guardrails and weightages.`,
    guardrails,
    critical_requirements: [],
    score_calculation: `Each guardrail's contribution equals recruiter weight × evidence strength; ${highWeightGaps.length ? `${highWeightGaps[0].requirement} was the largest gap.` : "no high-weight guardrail had a major gap."}`,
    strengths: uniqueLimited([
      ...parts.flatMap((part) => part.str ?? []),
      ...strongMatches.map((g) => `${g.requirement} contributed the full ${g.weight} points.`),
      ...partialMatches.map((g) => `${g.requirement} contributed ${g.contribution} of ${g.weight} possible points.`),
    ], 4),
    missing_requirements: uniqueLimited([
      ...parts.flatMap((part) => part.miss ?? []),
      ...guardrails.filter((g) => g.match_status === "No Evidence").map((g) => `${g.requirement} had no direct resume evidence.`),
    ], 4),
    tradeoffs: [],
    risk_alerts: uniqueLimited([
      ...parts.flatMap((part) => part.risk ?? []),
      ...highWeightGaps.map((g) => `${g.requirement} carries ${g.weight}% weight but scored ${g.contribution} points.`),
    ], 4),
    assumptions: [],
    missing_information: uniqueLimited(parts.flatMap((part) => part.gap ?? []), 4),
    verification_needed: uniqueLimited(parts.flatMap((part) => part.verify ?? []), 4),
    interview_questions: buildInterviewQuestions(guardrails),
    top_5_questions: [],
    rubric_keywords: uniqueLimited([
      ...items.flatMap((item) => keywordPhrases(`${item.label} ${item.explanation}`, 6)),
      ...parts.flatMap((part) => part.kw ?? []),
    ], 24),
  };
}

export const evaluateResume = createServerFn({ method: "POST" })
  .inputValidator((data: { jd: string; resume: string; criteria: LockedCriteria }) => {
    if (!data?.jd?.trim() || !data?.resume?.trim()) throw new Error("Job Description and Resume are required.");
    if (!data?.criteria?.guardrails?.length) throw new Error("Locked criteria are required.");
    return data;
  })
  .handler(async ({ data }): Promise<EvaluationResult> => {
    const items = buildEvaluationItems(data.criteria);
    const parts: CompactGuardrailResult[] = [];

    for (const item of items) {
      parts.push(await evaluateOneItem(item, data.resume));
    }

    return assembleEvaluation(items, parts);
  });
