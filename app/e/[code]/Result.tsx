"use client";
import { fmtAnswer, TYPE_LABEL, type QType } from "@/lib/types";
import { Deco, Who } from "@/components/ui";

export type MyResult = {
  status: string; title: string; course: string; pass_score: number; name: string; dept: string;
  score: number; max_score: number; rank: number; n: number; avg: number;
  items: { no: number; type: QType; stem: string; choices: string[]; answer: (number | string)[]; explanation: string; points: number; my: unknown; earned: number; correct: boolean; pending: boolean }[];
};

export default function Result({ r }: { r: MyResult }) {
  const pct = r.max_score ? Math.round((Number(r.score) / Number(r.max_score)) * 1000) / 10 : 0;
  const avgPct = r.max_score ? Math.round((Number(r.avg) / Number(r.max_score)) * 1000) / 10 : 0;
  const top = r.n ? Math.max(1, Math.round((r.rank / r.n) * 100)) : 100;
  const pass = pct >= Number(r.pass_score);
  const nOk = r.items.filter((i) => i.correct).length;
  const C = 2 * Math.PI * 70;
  const key = (it: MyResult["items"][number]) =>
    it.type === "single" || it.type === "multi" ? fmtAnswer(it, it.answer) : it.answer.map(String).join(" / ");

  return (
    <div className="phone" style={{ paddingBottom: 40 }}>
      <div className="topbar row between"><span className="chip">{r.title}</span><Who name={r.name} /></div>
      <Deco src={pass ? "trophy" : "star"} style={{ width: 84, right: 0, top: 70 }} />
      {pass && <Deco src="crown" cls="d2" style={{ width: 60, left: 6, top: 90 }} />}

      <div className="center z1" style={{ paddingTop: 10 }}>
        <p className="hand" style={{ fontSize: 30, margin: 0 }}>{pass ? "축하해요! 멋져요 🎉" : "수고했어요! 다음엔 더 잘할 수 있어요 💪"}</p>
        <div style={{ position: "relative", width: 170, height: 170, margin: "10px auto" }}>
          <svg width="170" height="170" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="85" cy="85" r="70" fill="#fff" stroke="#e8f2fb" strokeWidth="14" />
            <circle cx="85" cy="85" r="70" fill="none" stroke="url(#g)" strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} />
            <defs><linearGradient id="g"><stop offset="0" stopColor="#0066b3" /><stop offset="1" stopColor="#22b8c8" /></linearGradient></defs>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <div><div className="bigcount" style={{ fontSize: 50 }}>{pct}</div><div className="muted" style={{ fontWeight: 800 }}>점 / 100</div></div>
          </div>
        </div>
        <div className="row wrapflex" style={{ justifyContent: "center" }}>
          <span className={`chip ${pass ? "ended" : "live"}`}>{pass ? "합격" : "합격 기준 미달"} (기준 {r.pass_score}점)</span>
          <span className="chip">{r.rank}등 / {r.n}명 · 상위 {top}%</span>
          <span className="chip" style={{ background: "#fff" }}>정답 {nOk}/{r.items.length}</span>
          <span className="chip" style={{ background: "#fff" }}>전체 평균 {avgPct}점</span>
        </div>
      </div>

      <div className="card z1" style={{ marginTop: 18 }}>
        <h2>📝 문항별 결과</h2>
        {r.items.map((it) => (
          <details className="result-item" key={it.no} open={!it.correct}>
            <summary>
              <span style={{ fontSize: 20 }}>{it.correct ? "✅" : it.pending ? "⏳" : "❌"}</span>
              <span style={{ flex: 1 }}>Q{it.no}. {it.stem} <span className="chip" style={{ marginLeft: 4 }}>{TYPE_LABEL[it.type]}</span></span>
              <span className="small muted" style={{ whiteSpace: "nowrap" }}>{it.earned}/{it.points}점</span>
            </summary>
            <dl className="kv">
              <dt>내 답</dt><dd className={it.correct ? "ok" : it.pending ? "" : "ng"}>{fmtAnswer(it, it.my)}</dd>
              {it.pending && (<><dt>채점</dt><dd className="muted">⏳ 채점 중이에요. 잠시 후 점수가 자동으로 반영돼요.</dd></>)}
              {!it.correct && (<><dt>{it.type === "essay" ? "모범답안" : "정답"}</dt><dd><b>{key(it)}</b></dd></>)}
              <dt>해설</dt><dd>{it.explanation}</dd>
            </dl>
          </details>
        ))}
      </div>
      <button className="btn primary block lg noprint" style={{ marginTop: 16 }} onClick={() => window.print()}>📄 내 리포트 PDF로 저장</button>
      <p className="muted small center noprint">개인 리포트는 입력하신 이메일로도 발송돼요.</p>
    </div>
  );
}
