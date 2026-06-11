import { createServerFn } from "@tanstack/react-start";

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
  top_5_questions: string[];
  rubric_keywords: string[];
}

const SYSTEM_PROMPT = `You are an Explainable Resume Evaluation Assistant for recruiters. Given a Job Description and a Resume, perform the full pipeline in one shot:

1. Derive a hiring rubric from the JD: guardrails with weights (total = 100) and critical requirements.
2. Evaluate the resume against that rubric using ONLY evidence explicitly present in the resume. Never infer missing experience.
3. Score each guardrail: Strong Match=100%, Partial Match=60%, Weak Match=30%, No Evidence=0% of its weight.
4. Decision: >=80 Strong Proceed, 70-79 Proceed with Review, 50-69 Manual Review Required, <50 Unlikely Fit.
   - Missing any critical requirement => Unlikely Fit regardless of score.
   - Ambiguous/contradictory evidence => Manual Review Required.
5. Expose all reasoning, assumptions, uncertainties, and risk alerts.
6. Generate recruiter interview questions tailored to the candidate and rubric.
7. Identify rubric keywords (skills, tools, certs, methodologies) that appear in the rubric so the UI can highlight them.

Return STRICT JSON ONLY matching this TypeScript shape, no markdown, no commentary:
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
  "top_5_questions": string[],
  "rubric_keywords": string[]
}

Rules:
- Guardrail weights must sum to exactly 100.
- contribution = weight * (1.0 | 0.6 | 0.3 | 0) for the match level.
- match_score = sum of contributions, rounded to nearest integer.
- If no evidence, say so explicitly in evidence array as "No Evidence Found".
- Provide 6-10 interview questions across categories: Ownership, Decision-Making, Problem Solving, Impact Validation, Stakeholder Management, Domain Expertise, Risk Areas, Growth Potential.
- rubric_keywords: skills/tools/certs/domains taken from the rubric you derived.`;

export const evaluateResume = createServerFn({ method: "POST" })
  .inputValidator((data: { jd: string; resume: string }) => {
    if (!data?.jd?.trim() || !data?.resume?.trim()) {
      throw new Error("Both Job Description and Resume are required.");
    }
    return data;
  })
  .handler(async ({ data }): Promise<EvaluationResult> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error("GROQ_API_KEY is not configured.");

    const userMessage = `JOB DESCRIPTION:\n${data.jd}\n\n---\n\nRESUME:\n${data.resume}\n\nReturn the JSON object now.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 8000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq API error ${res.status}: ${text.slice(0, 500)}`);
    }

    const payload = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const raw = payload.choices?.[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Model did not return JSON.");
    try {
      return JSON.parse(jsonMatch[0]) as EvaluationResult;
    } catch (e) {
      throw new Error("Failed to parse JSON: " + (e as Error).message);
    }
  });