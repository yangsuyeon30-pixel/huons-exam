import { Type } from "@google/genai";
import { fail, gemini, HttpError, MODEL, requireAdmin } from "@/lib/server";

export const maxDuration = 300;

type Counts = { single: number; multi: number; short: number; essay: number };

const schema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["single", "multi", "short", "essay"] },
          stem: { type: Type.STRING },
          choices: { type: Type.ARRAY, items: { type: Type.STRING } },
          answer_index: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          answer_text: { type: Type.ARRAY, items: { type: Type.STRING } },
          explanation: { type: Type.STRING },
        },
        required: ["type", "stem", "choices", "answer_index", "answer_text", "explanation"],
      },
    },
  },
  required: ["questions"],
};

function prompt(material: string, c: Counts, focus: string) {
  return `너는 기업 교육 평가 문항 출제 전문가다. 아래 [교육 자료]에서만 근거를 찾아 한국어 시험 문제를 출제하라.

출제 수량(정확히 이 개수):
- single(객관식, 정답 1개): ${c.single}문항
- multi(객관식, 정답 2개 이상 — 문제 끝에 "(모두 고르시오)" 표기): ${c.multi}문항
- short(단답형 주관식, 1~5단어로 답하는 용어·숫자·이름): ${c.short}문항
- essay(서술형, 2~4문장으로 답하는 이해·적용 문제): ${c.essay}문항

규칙:
- 객관식(single/multi)은 반드시 보기 4개(choices 길이 4). answer_index 는 0부터 시작하는 정답 보기 번호. 정답 위치를 고르게 섞을 것. 그럴듯한 오답을 만들 것. answer_text 는 빈 배열.
- short 는 choices 빈 배열, answer_index 빈 배열, answer_text 에 허용 정답을 표기 변형까지 1~4개(예: ["인재개발원","인재 개발원"]).
- essay 는 choices·answer_index 빈 배열, answer_text 에 모범답안 1개와 채점 핵심 키워드를 담은 문장.
- explanation 은 왜 그것이 정답인지, 자주 하는 오해가 무엇인지 1~3문장. 자료의 어느 부분 근거인지 언급.
- 자료에 없는 내용, 지엽적 숫자 암기, 말장난 문제는 피하고 핵심 개념·적용 위주로. 문항끼리 중복 금지.
- 출제 순서: single → multi → short → essay.
${focus ? `- 관리자 요청 사항: ${focus}` : ""}

[교육 자료]
${material}`;
}

const clampN = (v: unknown) => Math.max(0, Math.min(50, Math.floor(Number(v) || 0)));

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const material = String(body.material ?? "").slice(0, 600_000);
    if (material.trim().length < 50) throw new HttpError(400, "교재 내용이 너무 짧습니다. 파일을 다시 확인해 주세요");
    const counts: Counts = { single: clampN(body.counts?.single), multi: clampN(body.counts?.multi), short: clampN(body.counts?.short), essay: clampN(body.counts?.essay) };
    const total = counts.single + counts.multi + counts.short + counts.essay;
    if (total < 1 || total > 100) throw new HttpError(400, "문항 수는 1~100개로 지정해 주세요");

    const res = await gemini().models.generateContent({
      model: MODEL,
      contents: prompt(material, counts, String(body.focus ?? "").slice(0, 500)),
      config: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.7 },
    });
    const parsed = JSON.parse(res.text ?? "{}");
    const questions = (parsed.questions ?? []).map((q: Record<string, unknown>) => {
      const type = q.type as string;
      const objective = type === "single" || type === "multi";
      const choices = objective ? ((q.choices as string[]) ?? []).slice(0, 4) : [];
      while (objective && choices.length < 4) choices.push("");
      const idx = ((q.answer_index as number[]) ?? []).filter((i) => i >= 0 && i < 4);
      return {
        type, stem: String(q.stem ?? ""), choices,
        answer: objective ? (type === "single" ? idx.slice(0, 1) : idx) : ((q.answer_text as string[]) ?? []),
        explanation: String(q.explanation ?? ""),
        points: type === "essay" ? 3 : type === "multi" ? 2 : 1,
      };
    });
    return Response.json({ questions });
  } catch (e) {
    return fail(e);
  }
}
