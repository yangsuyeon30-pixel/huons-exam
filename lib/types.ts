export type QType = "single" | "multi" | "short" | "essay";

export const TYPE_LABEL: Record<QType, string> = {
  single: "객관식",
  multi: "복수정답",
  short: "단답형",
  essay: "서술형",
};

export type Question = {
  id?: string;
  no?: number;
  type: QType;
  stem: string;
  choices: string[];
  answer: (number | string)[]; // single/multi: 보기 index, short: 허용 정답들, essay: 모범답안
  explanation: string;
  points: number;
};

export type ExamStatus = "draft" | "live" | "ended";

export type Exam = {
  id: string;
  code: string;
  title: string;
  course: string;
  duration_min: number;
  warn_sec: number;
  pass_score: number;
  status: ExamStatus;
  started_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export type Graded = Record<string, { earned: number; correct: boolean; pending: boolean }>;

export type Attempt = {
  id: string;
  exam_id: string;
  name: string;
  email: string;
  dept: string;
  joined_at: string;
  submitted_at: string | null;
  answers: Record<string, unknown>;
  overrides: Record<string, number>;
  graded: Graded;
  score: number | null;
  max_score: number | null;
  emailed_at: string | null;
};

export type Results = { exam: Exam; questions: Required<Question>[]; attempts: Attempt[] };

export const STATUS_LABEL: Record<ExamStatus, string> = { draft: "준비", live: "진행 중", ended: "종료" };

// 학습자 답을 사람이 읽는 문자열로
export function fmtAnswer(q: { type: QType; choices: string[] }, v: unknown): string {
  if (v === null || v === undefined || v === "") return "(무응답)";
  if (q.type === "single" || q.type === "multi") {
    const arr = Array.isArray(v) ? v : [v];
    if (!arr.length) return "(무응답)";
    return arr.map((i) => `${"ABCD"[Number(i)] ?? "?"}. ${q.choices[Number(i)] ?? ""}`).join(", ");
  }
  return String(v);
}

export function fmtKey(q: { type: QType; choices: string[]; answer: unknown[] }): string {
  if (q.type === "single" || q.type === "multi") return fmtAnswer(q, q.answer);
  return q.answer.map(String).join(" / ");
}
