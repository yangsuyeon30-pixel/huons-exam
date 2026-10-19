import type { Results, QType } from "./types";

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// 모집단 표준편차(응시자 전체가 대상이므로)
export function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
export function quantile(xs: number[], q: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
}
export const r1 = (x: number) => Math.round(x * 10) / 10;

export type ItemStat = {
  qid: string;
  no: number;
  type: QType;
  stem: string;
  rate: number; // 정답률 %
  disc: number; // 변별도(상위27% - 하위27% 정답률), -1~1
  choiceDist: number[]; // 보기별 선택 인원 (객관식)
  answered: number;
};

export type Stats = {
  n: number;
  max: number;
  scores: number[]; // 100점 환산
  avg: number;
  med: number;
  sd: number;
  min: number;
  maxScore: number;
  q1: number;
  q3: number;
  passRate: number;
  kr20: number; // 신뢰도
  hist: number[]; // 0-9,10-19,...,90-100 (10칸)
  items: ItemStat[];
  byType: { type: QType; rate: number; count: number }[];
  ranked: { id: string; name: string; dept: string; email: string; score: number; raw: number; rank: number; secs: number | null; pass: boolean }[];
};

export function computeStats(r: Results): Stats {
  const { exam, questions, attempts } = r;
  const max = questions.reduce((a, q) => a + Number(q.points), 0) || 1;
  const rows = attempts.map((a) => {
    const raw = Number(a.score ?? 0);
    const start = exam.started_at ? Date.parse(exam.started_at) : null;
    const end = a.submitted_at ? Date.parse(a.submitted_at) : null;
    return {
      id: a.id, name: a.name, dept: a.dept, email: a.email, raw,
      score: r1((raw / max) * 100),
      secs: start && end ? Math.max(0, Math.round((end - start) / 1000)) : null,
    };
  });
  const scores = rows.map((x) => x.score);
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const ranked = sorted.map((x) => ({
    ...x,
    rank: 1 + sorted.filter((y) => y.score > x.score).length,
    pass: x.score >= Number(exam.pass_score),
  }));

  const hist = Array(10).fill(0);
  scores.forEach((s) => hist[Math.min(9, Math.floor(s / 10))]++);

  // 변별도용 상·하위 27% 집단
  const k = Math.max(1, Math.round(attempts.length * 0.27));
  const byScore = [...attempts].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
  const upper = byScore.slice(0, k);
  const lower = byScore.slice(-k);
  const ok = (a: (typeof attempts)[number], qid: string) => !!a.graded?.[qid]?.correct;
  const rateOf = (group: typeof attempts, qid: string) => (group.length ? group.filter((a) => ok(a, qid)).length / group.length : 0);

  const items: ItemStat[] = questions.map((q) => {
    const qid = q.id;
    const choiceDist = q.choices.map(() => 0);
    let answered = 0;
    attempts.forEach((a) => {
      const v = a.answers?.[qid];
      if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)) answered++;
      if (Array.isArray(v)) v.forEach((i) => { if (choiceDist[Number(i)] !== undefined) choiceDist[Number(i)]++; });
    });
    return {
      qid, no: q.no, type: q.type, stem: q.stem,
      rate: r1(rateOf(attempts, qid) * 100),
      disc: Math.round((rateOf(upper, qid) - rateOf(lower, qid)) * 100) / 100,
      choiceDist, answered,
    };
  });

  const types: QType[] = ["single", "multi", "short", "essay"];
  const byType = types
    .map((t) => {
      const its = items.filter((i) => i.type === t);
      return { type: t, count: its.length, rate: r1(mean(its.map((i) => i.rate))) };
    })
    .filter((x) => x.count);

  // KR-20 (문항 정오 기준 신뢰도)
  let kr20 = 0;
  if (attempts.length > 1 && questions.length > 1) {
    const totals = attempts.map((a) => questions.filter((q) => ok(a, q.id)).length);
    const vt = stdev(totals) ** 2;
    const pq = questions.reduce((s, q) => {
      const p = rateOf(attempts, q.id);
      return s + p * (1 - p);
    }, 0);
    const kk = questions.length;
    kr20 = vt > 0 ? Math.round((kk / (kk - 1)) * (1 - pq / vt) * 100) / 100 : 0;
  }

  return {
    n: attempts.length, max, scores,
    avg: r1(mean(scores)), med: r1(median(scores)), sd: r1(stdev(scores)),
    min: scores.length ? Math.min(...scores) : 0, maxScore: scores.length ? Math.max(...scores) : 0,
    q1: r1(quantile(scores, 0.25)), q3: r1(quantile(scores, 0.75)),
    passRate: attempts.length ? r1((ranked.filter((x) => x.pass).length / attempts.length) * 100) : 0,
    kr20, hist, items, byType, ranked,
  };
}

export function fmtSecs(s: number | null) {
  if (s === null) return "-";
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}
