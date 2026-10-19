// 통계 계산 자체 점검: npx tsx lib/stats.check.ts
import assert from "node:assert/strict";
import { computeStats, mean, median, stdev } from "./stats";
import type { Results } from "./types";

assert.equal(mean([1, 2, 3]), 2);
assert.equal(median([3, 1, 2, 10]), 2.5);
assert.equal(stdev([2, 4, 4, 4, 5, 5, 7, 9]), 2);

const q = (id: string, no: number) => ({ id, no, type: "single" as const, stem: id, choices: ["a", "b", "c", "d"], answer: [0], explanation: "", points: 5 });
const at = (id: string, score: number, c1: boolean, c2: boolean) => ({
  id, exam_id: "e", name: id, email: "", dept: "", joined_at: "", submitted_at: null, answers: { q1: [c1 ? 0 : 1] }, overrides: {},
  graded: { q1: { earned: c1 ? 5 : 0, correct: c1, pending: false }, q2: { earned: c2 ? 5 : 0, correct: c2, pending: false } },
  score, max_score: 10, emailed_at: null,
});
const r: Results = {
  exam: { id: "e", code: "X", title: "", course: "", duration_min: 10, warn_sec: 60, pass_score: 60, status: "ended", started_at: null, ends_at: null, ended_at: null, created_at: "" },
  questions: [q("q1", 1), q("q2", 2)],
  attempts: [at("a", 10, true, true), at("b", 5, true, false), at("c", 0, false, false), at("d", 5, false, true)],
};
const s = computeStats(r);
assert.equal(s.avg, 50);
assert.equal(s.passRate, 25);
assert.equal(s.items[0].rate, 50);
assert.deepEqual(s.items[0].choiceDist, [2, 2, 0, 0]);
assert.equal(s.ranked[0].name, "a");
assert.equal(s.ranked.find((x) => x.name === "d")!.rank, 2); // 동점 공동 2위
assert.equal(s.hist[5], 2);
console.log("stats OK", s.sd, s.kr20);
