"use client";
import type { ChartConfiguration } from "chart.js";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import ChartBox from "@/components/ChartBox";
import { AdminGate, AdminHeader, adminFetch } from "@/components/admin";
import { Deco, Err, Spinner } from "@/components/ui";
import { exportCsv, exportDocx, exportHtml, exportPersonalZip, printPdf } from "@/lib/exporters";
import { summaryLines, weakItems } from "@/lib/report";
import { rpc } from "@/lib/sb";
import { computeStats, fmtSecs } from "@/lib/stats";
import { fmtAnswer, fmtKey, STATUS_LABEL, TYPE_LABEL, type Results } from "@/lib/types";

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdminGate>{(pass) => <Dashboard pass={pass} id={id} />}</AdminGate>;
}

const V = "#0066b3", MINT = "#17b890", CORAL = "#ff5a6e", SUN = "#ffb82e", SKY = "#7fc4ec", PINK = "#22b8c8";

function Dashboard({ pass, id }: { pass: string; id: string }) {
  const [r, setR] = useState<Results | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<string | null>(null);

  const load = useCallback(() => rpc<Results>("hx_admin_results", { p: pass, p_id: id }).then(setR).catch((e) => setErr(e.message)), [pass, id]);
  useEffect(() => { load(); }, [load]);
  const s = useMemo(() => (r ? computeStats(r) : null), [r]);

  const charts = useMemo(() => {
    if (!s || !r) return null;
    const bands = [s.scores.filter((x) => x >= 90).length, s.scores.filter((x) => x >= 80 && x < 90).length, s.scores.filter((x) => x >= 70 && x < 80).length, s.scores.filter((x) => x >= 60 && x < 70).length, s.scores.filter((x) => x < 60).length];
    const grid = { grid: { color: "rgba(0, 102, 179,.08)" } };
    return {
      bands,
      donut: { type: "doughnut", data: { labels: ["90점 이상", "80~89점", "70~79점", "60~69점", "60점 미만"], datasets: [{ data: bands, backgroundColor: [V, SKY, SUN, PINK, CORAL], borderWidth: 3, borderColor: "#fff" }] }, options: { cutout: "68%", plugins: { legend: { position: "right" } } } } as ChartConfiguration,
      hist: { type: "bar", data: { labels: ["0~9", "10~19", "20~29", "30~39", "40~49", "50~59", "60~69", "70~79", "80~89", "90~100"], datasets: [{ label: "인원", data: s.hist, backgroundColor: "rgba(0, 102, 179,.75)", borderRadius: 8 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { ...grid, ticks: { precision: 0 } }, x: { grid: { display: false } } } } } as ChartConfiguration,
      items: { type: "bar", data: { labels: s.items.map((i) => `Q${i.no}`), datasets: [{ label: "정답률(%)", data: s.items.map((i) => i.rate), backgroundColor: s.items.map((i) => (i.rate < 50 ? CORAL : i.rate < 70 ? SUN : MINT)), borderRadius: 6 }] }, options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100, ...grid } } } } as ChartConfiguration,
      types: { type: "bar", data: { labels: s.byType.map((t) => TYPE_LABEL[t.type]), datasets: [{ label: "정답률(%)", data: s.byType.map((t) => t.rate), backgroundColor: [PINK, V, MINT, SUN], borderRadius: 10 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, ...grid } } } } as ChartConfiguration,
      disc: { type: "bar", data: { labels: s.items.map((i) => `Q${i.no}`), datasets: [{ label: "변별도", data: s.items.map((i) => i.disc), backgroundColor: s.items.map((i) => (i.disc < 0.2 ? CORAL : SKY)), borderRadius: 6 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { min: -1, max: 1, ...grid } } } } as ChartConfiguration,
      scatter: { type: "scatter", data: { datasets: [{ label: "응시자", data: s.ranked.filter((x) => x.secs !== null).map((x) => ({ x: Math.round((x.secs! / 60) * 10) / 10, y: x.score })), backgroundColor: "rgba(34, 184, 200,.8)", pointRadius: 6 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: "소요시간(분)" }, ...grid }, y: { min: 0, max: 100, title: { display: true, text: "점수" }, ...grid } } } } as ChartConfiguration,
    };
  }, [s, r]);

  const run = async (label: string, fn: () => Promise<unknown> | unknown) => {
    setBusy(label); setErr(""); setMsg("");
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };

  const gradeEssays = () => run("essay", async () => {
    const { graded } = await adminFetch<{ graded: number }>("/api/grade-essay", pass, { examId: id });
    await load();
    setMsg(graded ? `서술형 ${graded}건을 AI가 채점했어요. 응시자 상세에서 점수를 고칠 수 있어요.` : "채점할 서술형 응답이 없어요.");
  });

  const [mail, setMail] = useState<{ configured: boolean; via: string | null } | null>(null);
  useEffect(() => { fetch("/api/send-reports").then((x) => x.json()).then(setMail).catch(() => setMail({ configured: false, via: null })); }, []);

  const sendMail = (only?: string[]) => run("mail", async () => {
    const n = only?.length ?? r!.attempts.filter((a) => a.email).length;
    if (!confirm(`응시자 ${n}명에게 개인 리포트 메일을 보낼까요? (발송 계정: ${mail?.via})`)) return;
    const res = await adminFetch<{ sent: number; failed: { name: string; error: string }[] }>("/api/send-reports", pass, { examId: id, attemptIds: only });
    await load();
    if (res.failed.length) setErr(`메일 ${res.sent}건 발송, 실패 ${res.failed.length}건: ${res.failed.map((f) => `${f.name}(${f.error})`).join(", ")}`);
    else setMsg(`✅ 메일 ${res.sent}건을 실제로 발송했어요. 표의 «메일» 칸에서 발송 여부를 확인할 수 있어요.`);
  });

  if (!r || !s || !charts) return <div className="wrap center"><Err msg={err} /><Spinner dark /></div>;
  const pending = r.attempts.some((a) => Object.values(a.graded ?? {}).some((g) => g.pending));
  const top3 = s.ranked.slice(0, 3);
  const rows = s.ranked.filter((x) => !q || `${x.name} ${x.dept} ${x.email}`.includes(q));
  const who = detail ? r.attempts.find((a) => a.id === detail) : null;

  return (
    <div className="wrap">
      <AdminHeader title="결과 대시보드" crumbs={[{ href: "/admin", label: "← 시험 목록" }, { href: `/admin/exams/${id}/live`, label: "진행 화면" }]} />
      <Deco src="trophy" style={{ width: 90, right: 0, top: 70 }} />
      <div className="row between wrapflex z1" style={{ margin: "8px 0 16px" }}>
        <div>
          <div className="muted" style={{ fontWeight: 800 }}>{r.exam.course} · {r.exam.started_at ? new Date(r.exam.started_at).toLocaleString("ko-KR") : "미시행"}</div>
          <h1 className="display" style={{ fontSize: 40 }}>📊 {r.exam.title}</h1>
        </div>
        <span className={`chip ${r.exam.status}`}>{STATUS_LABEL[r.exam.status]}</span>
      </div>

      <div className="card z1 noprint" style={{ padding: 16 }}>
        <div className="row wrapflex">
          <b style={{ marginRight: 6 }}>📥 팀장님 보고용</b>
          <button className="btn primary sm" onClick={() => exportHtml(r, s)}>HTML 리포트</button>
          <button className="btn primary sm" disabled={!!busy} onClick={() => run("docx", () => exportDocx(r, s))}>{busy === "docx" ? <Spinner /> : "Word(.docx)"}</button>
          <button className="btn primary sm" onClick={() => printPdf(r, s)}>PDF 출력</button>
          <button className="btn sm" onClick={() => exportCsv(r, s)}>CSV(엑셀)</button>
          <span style={{ flex: 1 }} />
          <b style={{ marginRight: 6 }}>👤 개인 리포트</b>
          <button className="btn pink sm" disabled={!!busy || r.exam.status !== "ended" || !mail?.configured} onClick={() => sendMail()}
            title={mail?.configured ? `발송 계정: ${mail.via}` : "메일 발송 계정이 아직 설정되지 않았어요"}>{busy === "mail" ? <Spinner /> : mail?.configured ? "✉️ 전원 메일 발송" : "✉️ 메일 발송(설정 필요)"}</button>
          <button className="btn sm" onClick={() => run("zip", () => exportPersonalZip(r, s))}>zip 다운로드</button>
          {r.questions.some((x) => x.type === "essay") && <button className="btn mint sm" disabled={!!busy} onClick={gradeEssays}>{busy === "essay" ? <Spinner /> : "🤖 서술형 AI 채점"}</button>}
        </div>
        {mail && !mail.configured && <div className="err" style={{ marginTop: 10 }}>✉️ 메일 발송 계정이 아직 설정되지 않아 지금은 메일을 보낼 수 없어요. 설정 전에는 「zip 다운로드」로 개인 리포트를 받아 전달해 주세요.</div>}
        {mail?.configured && r.attempts.some((a) => a.email && !a.emailed_at) && r.attempts.some((a) => a.emailed_at) && (
          <div className="info" style={{ marginTop: 10 }}>아직 메일을 못 받은 {r.attempts.filter((a) => a.email && !a.emailed_at).length}명이 있어요.{" "}
            <button className="btn sm" disabled={!!busy} onClick={() => sendMail(r.attempts.filter((a) => a.email && !a.emailed_at).map((a) => a.id))}>미발송자에게만 보내기</button></div>
        )}
        {pending && <div className="info" style={{ marginTop: 10 }}>⏳ 채점 대기 중인 서술형 답안이 있어요. 「서술형 AI 채점」을 누르거나 응시자 상세에서 직접 점수를 넣어 주세요.</div>}
        {msg && <div className="info" style={{ marginTop: 10 }}>{msg}</div>}
        {err && <div style={{ marginTop: 10 }}><Err msg={err} /></div>}
      </div>

      <div className="grid4 z1" style={{ marginTop: 16 }}>
        <Kpi ic="👥" bg="#e8f2fb" label="응시자 수" value={`${s.n}명`} />
        <Kpi img="trophy" bg="#fff3d6" label="평균 점수" value={`${s.avg}점`} />
        <Kpi ic="Σ" bg="#e3f4fb" label="표준편차" value={`${s.sd}`} />
        <Kpi ic="✅" bg="#ddf7ee" label={`합격률 (${r.exam.pass_score}점↑)`} value={`${s.passRate}%`} />
        <Kpi ic="📍" bg="#ffe9ef" label="중앙값" value={`${s.med}점`} />
        <Kpi ic="⬆️" bg="#e8f2fb" label="최고 / 최저" value={`${s.maxScore} / ${s.min}`} />
        <Kpi ic="📦" bg="#fff3d6" label="사분위 Q1~Q3" value={`${s.q1}~${s.q3}`} />
        <Kpi ic="🧪" bg="#e3f4fb" label="신뢰도 KR-20" value={`${s.kr20}`} />
      </div>

      <div className="card z1" style={{ marginTop: 16 }}>
        <h2>💡 한 줄 요약</h2>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, fontWeight: 600 }}>{summaryLines(s, r).map((l, k) => <li key={k}>{l}</li>)}</ul>
      </div>

      <div className="grid2 z1" style={{ marginTop: 16 }}>
        <div className="card"><h2>🍩 점수대 분포</h2><ChartBox config={charts.donut} height={230} /></div>
        <div className="card">
          <h2>🏆 TOP 3 랭킹</h2>
          {top3.length ? (
            <div className="podium">
              {[1, 0, 2].map((k) => top3[k] && (
                <div key={k} className={`p${k + 1}`}>
                  {k === 0 && /* eslint-disable-next-line @next/next/no-img-element */ <img src="/img/crown.svg" alt="" style={{ width: 54 }} />}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/img/medal${k + 1}.svg`} alt={`${k + 1}위`} style={{ width: 52, display: "block", margin: "0 auto" }} />
                  <div className="nm">{top3[k].name}</div><div className="sc">{top3[k].score}점</div>
                  <div className="step">{top3[k].rank}</div>
                </div>
              ))}
            </div>
          ) : <p className="muted">응시자가 없어요.</p>}
        </div>
      </div>

      <div className="grid2 z1" style={{ marginTop: 16 }}>
        <div className="card"><h2>📈 점수 분포 (100점 환산)</h2><ChartBox config={charts.hist} /></div>
        <div className="card"><h2>🧩 유형별 정답률</h2><ChartBox config={charts.types} /></div>
        <div className="card"><h2>✅ 문항별 정답률</h2><ChartBox config={charts.items} height={Math.max(240, s.items.length * 26)} /></div>
        <div className="card"><h2>🎯 문항 변별도 <span className="muted small">(0.2 미만 = 빨강, 개선 검토)</span></h2><ChartBox config={charts.disc} /></div>
        <div className="card"><h2>⏱ 소요시간 vs 점수</h2><ChartBox config={charts.scatter} /></div>
        <div className="card">
          <h2>🚨 취약 문항 Top 5</h2>
          <table className="tbl"><thead><tr><th>문항</th><th>내용</th><th>정답률</th></tr></thead>
            <tbody>{weakItems(s).map((i) => <tr key={i.qid}><td>Q{i.no}</td><td>{i.stem}</td><td className={i.rate < 50 ? "ng" : ""}><b>{i.rate}%</b></td></tr>)}</tbody></table>
        </div>
      </div>

      <div className="card z1" style={{ marginTop: 16 }}>
        <h2>🔍 문항 분석</h2>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>문항</th><th>유형</th><th>정답</th><th>정답률</th><th>변별도</th><th>보기별 선택 (A / B / C / D)</th></tr></thead>
          <tbody>{r.questions.map((qq, k) => {
            const it = s.items[k];
            return (
              <tr key={qq.id}><td style={{ minWidth: 240 }}>Q{qq.no}. {qq.stem}</td><td>{TYPE_LABEL[qq.type]}</td><td>{fmtKey(qq)}</td><td><b>{it.rate}%</b></td><td>{it.disc}</td>
                <td>{qq.choices.length ? it.choiceDist.map((c, j) => <span key={j} className={(qq.answer as number[]).includes(j) ? "ok" : ""} style={{ fontWeight: 800, marginRight: 8 }}>{"ABCD"[j]} {c}</span>) : "-"}</td></tr>
            );
          })}</tbody>
        </table></div>
      </div>

      <div className="card z1" style={{ marginTop: 16 }}>
        <div className="row between wrapflex"><h2 style={{ margin: 0 }}>🙋 응시자별 결과</h2>
          <input className="input" style={{ maxWidth: 260 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·소속 검색" /></div>
        <div className="scroll" style={{ marginTop: 10 }}><table className="tbl">
          <thead><tr><th>순위</th><th>이름</th><th>소속</th><th>점수</th><th>정답 수</th><th>결과</th><th>소요시간</th><th>메일</th><th></th></tr></thead>
          <tbody>{rows.map((x) => {
            const a = r.attempts.find((y) => y.id === x.id)!;
            return (
              <tr key={x.id}><td><b>{x.rank}</b></td><td><b>{x.name}</b><div className="muted small">{x.email}</div></td><td>{x.dept}</td><td><b>{x.score}</b></td>
                <td>{r.questions.filter((qq) => a.graded?.[qq.id]?.correct).length}/{r.questions.length}</td>
                <td>{x.pass ? <span className="chip ended">합격</span> : <span className="chip live">미달</span>}</td><td>{fmtSecs(x.secs)}</td>
                <td className="small">{a.emailed_at ? "✅ 발송" : "-"}</td><td><button className="btn sm" onClick={() => setDetail(x.id)}>상세</button></td></tr>
            );
          })}</tbody>
        </table></div>
      </div>

      {who && (
        <div className="modal-bg" onClick={() => setDetail(null)}>
          <div className="card" style={{ maxWidth: 760, width: "100%", maxHeight: "88vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="row between"><h2 style={{ margin: 0 }}>{who.name} <span className="muted small">{who.dept}</span></h2><button className="btn ghost sm" onClick={() => setDetail(null)}>닫기</button></div>
            {r.questions.map((qq) => {
              const g = who.graded?.[qq.id];
              return (
                <div className="result-item" key={qq.id}>
                  <div className="row between"><b>{g?.correct ? "✅" : g?.pending ? "⏳" : "❌"} Q{qq.no}. {qq.stem}</b>
                    <Override pass={pass} attemptId={who.id} qid={qq.id} max={Number(qq.points)} earned={g?.earned ?? 0} onDone={load} /></div>
                  <dl className="kv"><dt>답</dt><dd>{fmtAnswer(qq, who.answers?.[qq.id])}</dd><dt>정답</dt><dd>{fmtKey(qq)}</dd></dl>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ ic, img, bg, label, value }: { ic?: string; img?: string; bg: string; label: string; value: string }) {
  return (
    <div className="kpi">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <span className="ic" style={{ background: bg }}>{img ? <img src={`/img/${img}.svg`} alt="" /> : ic}</span>
      <div><span>{label}</span><b>{value}</b></div>
    </div>
  );
}

function Override({ pass, attemptId, qid, max, earned, onDone }: { pass: string; attemptId: string; qid: string; max: number; earned: number; onDone: () => void }) {
  const [v, setV] = useState(String(earned));
  useEffect(() => setV(String(earned)), [earned]);
  const save = async () => {
    const n = Math.max(0, Math.min(max, Number(v)));
    await rpc("hx_admin_override", { p: pass, p_attempt: attemptId, p_qid: qid, p_score: n });
    onDone();
  };
  return (
    <span className="row small" style={{ gap: 6, flex: "none" }}>
      <input className="num" type="number" min={0} max={max} step={0.5} value={v} onChange={(e) => setV(e.target.value)} aria-label="점수 수정" />
      <span className="muted">/ {max}</span>
      <button className="btn sm" onClick={save} disabled={Number(v) === earned}>수정</button>
    </span>
  );
}
