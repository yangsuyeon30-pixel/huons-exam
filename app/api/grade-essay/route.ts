// 서술형 AI 채점 초안: 문항별로 응답을 모아 한 번에 채점 → 관리자 수동 점수(override)로 저장. 관리자가 표에서 고칠 수 있다.
import { Type } from "@google/genai";
import { rpc } from "@/lib/sb";
import { fail, gemini, MODEL, requireAdmin } from "@/lib/server";
import type { Results } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const pass = await requireAdmin(req);
    const { examId } = await req.json();
    const r = await rpc<Results>("hx_admin_results", { p: pass, p_id: examId });
    let graded = 0;
    for (const q of r.questions.filter((x) => x.type === "essay")) {
      const todo = r.attempts.filter((a) => !(q.id in (a.overrides ?? {})) && String(a.answers?.[q.id] ?? "").trim());
      if (!todo.length) continue;
      const res = await gemini().models.generateContent({
        model: MODEL,
        contents: `서술형 문항을 채점하라. 배점 ${q.points}점, 0.5점 단위.
문항: ${q.stem}
모범답안·채점기준: ${q.answer.join(" / ")}
해설: ${q.explanation}

응답 목록(JSON): ${JSON.stringify(todo.map((a, i) => ({ i, answer: String(a.answers[q.id]).slice(0, 2000) })))}
각 응답에 대해 i 와 score 를 돌려줘. 핵심 개념이 맞으면 표현이 달라도 인정하고, 무관하거나 비어 있으면 0점.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.OBJECT, properties: { i: { type: Type.INTEGER }, score: { type: Type.NUMBER } }, required: ["i", "score"] },
          },
          temperature: 0,
        },
      });
      const scores: { i: number; score: number }[] = JSON.parse(res.text ?? "[]");
      for (const s of scores) {
        const a = todo[s.i];
        if (!a) continue;
        const score = Math.max(0, Math.min(Number(q.points), Math.round(Number(s.score) * 2) / 2));
        await rpc("hx_admin_override", { p: pass, p_attempt: a.id, p_qid: q.id, p_score: score });
        graded++;
      }
    }
    return Response.json({ graded });
  } catch (e) {
    return fail(e);
  }
}
