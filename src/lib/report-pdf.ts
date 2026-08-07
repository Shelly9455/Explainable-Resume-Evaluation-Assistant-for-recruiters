import { jsPDF } from "jspdf";
import type { EvaluationResult, LockedCriteria } from "@/lib/evaluate.functions";

interface Entry {
  name: string;
  result: EvaluationResult;
}

const M = 48;
const W = 595.28; // A4 pt
const H = 841.89;
const LINE = 14;

export function downloadReportPDF(entries: Entry[], criteria: LockedCriteria) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = M;

  const nl = (n = 1) => { y += LINE * n; page(); };
  const page = () => {
    if (y > H - M) { doc.addPage(); y = M; }
  };

  const text = (
    s: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number } = {},
  ) => {
    const { size = 10, bold = false, color = [15, 23, 42], indent = 0 } = opts;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(s, W - M * 2 - indent) as string[];
    for (const ln of lines) {
      page();
      doc.text(ln, M + indent, y);
      y += size + 4;
    }
  };

  const heading = (s: string) => {
    nl(0.5);
    page();
    doc.setDrawColor(226, 232, 240);
    doc.line(M, y - 10, W - M, y - 10);
    text(s, { size: 12, bold: true, color: [37, 99, 235] });
    y += 2;
  };

  const bullets = (items: string[]) => {
    if (!items?.length) { text("—", { indent: 12, color: [100, 116, 139] }); return; }
    for (const it of items) text(`•  ${it}`, { indent: 12 });
  };

  // Cover / criteria
  text("Candidate Evaluation Report", { size: 20, bold: true });
  text(new Date().toLocaleString(), { size: 9, color: [100, 116, 139] });
  nl(0.5);

  heading("Recruiter-Locked Criteria");
  text("Approved Guardrails", { size: 10, bold: true });
  bullets(criteria.guardrails.map((g) => `${g.name} (${g.importance}) — ${g.explanation}`));
  nl(0.3);
  text("Weightages", { size: 10, bold: true });
  bullets(criteria.weightages.map((w) => `${w.label}: ${w.weight}%`));

  entries.forEach((e, i) => {
    doc.addPage();
    y = M;
    const r = e.result;
    text(`Candidate ${i + 1} of ${entries.length}`, { size: 9, color: [100, 116, 139] });
    text(e.name, { size: 16, bold: true });
    text(
      `Decision: ${r.decision}   |   Score: ${Math.round(r.match_score)}/100   |   Confidence: ${r.confidence}`,
      { size: 11, bold: true, color: [13, 148, 136] },
    );
    nl(0.2);
    text(r.description || "", { color: [51, 65, 85] });

    heading("Candidate Summary");
    text(r.candidate_summary || "—");

    heading("Score Calculation");
    text(r.score_calculation || "—");

    heading("Guardrail Scorecard");
    for (const g of r.guardrails ?? []) {
      text(`${g.requirement}  —  ${g.match_status}  (weight ${g.weight}%, contribution ${g.contribution})`, {
        size: 10, bold: true,
      });
      bullets(g.explanation ?? []);
      if (g.evidence?.length) {
        text("Evidence:", { size: 9, bold: true, indent: 12, color: [100, 116, 139] });
        for (const ev of g.evidence) text(`"${ev}"`, { size: 9, indent: 24, color: [71, 85, 105] });
      }
      nl(0.3);
    }

    heading("Strengths");
    bullets(r.strengths ?? []);
    heading("Missing Requirements");
    bullets(r.missing_requirements ?? []);
    heading("Trade-offs");
    bullets(r.tradeoffs ?? []);
    heading("Risk Alerts");
    bullets(r.risk_alerts ?? []);

    heading("Deeper Interview Intelligence");
    for (const q of r.interview_questions ?? []) {
      text(q.question, { size: 10, bold: true });
      text(`Category: ${q.category}`, { size: 9, indent: 12, color: [100, 116, 139] });
      text(`Why it matters: ${q.why_matters}`, { size: 9, indent: 12 });
      text(`Strong answer: ${q.strong_answer}`, { size: 9, indent: 12 });
      text(`Risk signal: ${q.risk_signal}`, { size: 9, indent: 12, color: [220, 38, 38] });
      nl(0.3);
    }

    heading("AI Self-Audit");
    text("Assumptions", { size: 10, bold: true });
    bullets(r.assumptions ?? []);
    text("Missing information", { size: 10, bold: true });
    bullets(r.missing_information ?? []);
    text("Verification needed", { size: 10, bold: true });
    bullets(r.verification_needed ?? []);
  });

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${p} of ${total}`, W - M, H - 24, { align: "right" });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(entries.length === 1 ? `evaluation-${entries[0].name.replace(/\.[^.]+$/, "")}-${stamp}.pdf` : `evaluation-report-${stamp}.pdf`);
}