"use client";
import Link from "next/link";
import QRCode from "qrcode";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { AdminGate, AdminHeader, adminFetch } from "@/components/admin";
import { Deco, Err, Ring, Spinner, usePoll, useRemaining } from "@/components/ui";
import { rpc } from "@/lib/sb";
import { STATUS_LABEL, type Exam } from "@/lib/types";

type Live = { status: Exam["status"]; ends_at: string | null; server_now: string; people: { name: string; dept: string; answered: number; submitted: boolean }[] };

export default function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdminGate>{(pass) => <LiveView pass={pass} id={id} />}</AdminGate>;
}

function LiveView({ pass, id }: { pass: string; id: string }) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [nq, setNq] = useState(0);
  const [live, setLive] = useState<Live | null>(null);
  const [qr, setQr] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const url = exam && typeof window !== "undefined" ? `${location.origin}/e/${exam.code}` : "";

  const loadExam = useCallback(() => rpc<{ exam: Exam; questions: unknown[] }>("hx_admin_get", { p: pass, p_id: id })
    .then((r) => { setExam(r.exam); setNq(r.questions.length); }).catch((e) => setErr(e.message)), [pass, id]);
  useEffect(() => { loadExam(); }, [loadExam]);
  useEffect(() => { if (url) QRCode.toDataURL(url, { width: 640, margin: 1, color: { dark: "#0f2340" } }).then(setQr); }, [url]);
  usePoll(() => { rpc<Live>("hx_admin_live", { p: pass, p_id: id }).then(setLive).catch((e) => setErr(e.message)); }, 2500, [pass, id]);

  const status = live?.status ?? exam?.status;
  const [essay, setEssay] = useState("");
  const essayRun = useRef(false);
  useEffect(() => {
    if (status !== "ended" || essayRun.current || !exam) return;
    essayRun.current = true;
    adminFetch<{ graded: number }>("/api/grade-essay", pass, { examId: id })
      .then((r) => setEssay(r.graded ? `서술형 답안 ${r.graded}건을 AI가 자동 채점해 학습자 화면에 반영했어요.` : ""))
      .catch((e) => setEssay(`서술형 자동 채점 실패: ${e.message} (결과 대시보드에서 다시 시도하세요)`));
  }, [status, exam, pass, id]);
  const left = useRemaining(live?.ends_at, live?.server_now) ?? 0;
  const joined = live?.people.length ?? 0;
  const submitted = live?.people.filter((p) => p.submitted).length ?? 0;

  const act = async (action: string, min = 0, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true); setErr("");
    try {
      await rpc("hx_admin_action", { p: pass, p_id: id, p_action: action, p_min: min });
      await loadExam();
      setLive(await rpc<Live>("hx_admin_live", { p: pass, p_id: id }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!exam) return <div className="wrap center"><Err msg={err} /><Spinner dark /></div>;

  return (
    <div className="wrap">
      <AdminHeader title="시험 진행" crumbs={[{ href: "/admin", label: "← 시험 목록" }]} />
      <Deco src="star" style={{ width: 90, right: 0, top: 80 }} />
      <Deco src="molecule" cls="d2" style={{ width: 80, left: -20, top: 260 }} />
      <div className="row between wrapflex z1" style={{ margin: "10px 0 18px" }}>
        <div>
          <div className="muted" style={{ fontWeight: 800 }}>{exam.course}</div>
          <h1 className="display" style={{ fontSize: 40 }}>{exam.title}</h1>
        </div>
        <span className={`chip ${status}`} style={{ fontSize: 16, padding: "8px 16px" }}>{status === "live" ? "● " : ""}{STATUS_LABEL[status!]}</span>
      </div>
      <Err msg={err} />

      <div className="grid2 z1" style={{ alignItems: "start", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)" }}>
        <div className="card center stack">
          <h2 style={{ justifyContent: "center" }}>📱 휴대폰 카메라로 QR을 찍어 입장하세요</h2>
          <div className="qr" style={{ width: "min(100%, 400px)", margin: "0 auto" }}>{qr ? <img src={qr} alt="입장 QR 코드" /> : <Spinner dark />}</div>
          <div className="row" style={{ justifyContent: "center" }}>
            <code style={{ background: "#fff", padding: "10px 16px", borderRadius: 14, fontWeight: 800, fontSize: 18 }}>{url}</code>
            <button className="btn sm" onClick={() => navigator.clipboard.writeText(url)}>복사</button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>입장 코드 <b style={{ fontSize: 20, color: "var(--primary)" }}>{exam.code}</b> · 총 {nq}문항 · 제한시간 {exam.duration_min}분</p>
        </div>

        <div className="stack">
          <div className="grid2" style={{ gap: 14 }}>
            <div className="card center"><div className="muted" style={{ fontWeight: 800 }}>👥 입장</div><div className="bigcount">{joined}</div><div className="muted small">명</div></div>
            <div className="card center"><div className="muted" style={{ fontWeight: 800 }}>📮 제출</div><div className="bigcount" style={{ color: "var(--mint)" }}>{submitted}</div><div className="muted small">명</div></div>
          </div>
          <div className="card center stack">
            {status === "draft" && (
              <>
                <p className="hand" style={{ fontSize: 30, margin: 0 }}>모두 입장하면 시작 버튼을 눌러 주세요!</p>
                <button className="btn pink block lg" style={{ fontSize: 22, minHeight: 72 }} disabled={busy || !nq} onClick={() => act("start", 0, `제한시간 ${exam.duration_min}분으로 시험을 시작할까요?`)}>🚀 시험 시작</button>
                <Link href={`/admin/exams/${id}`} className="btn ghost">✏️ 문항 편집으로 돌아가기</Link>
              </>
            )}
            {status === "live" && (
              <>
                <div style={{ display: "flex", justifyContent: "center" }}><Ring size="lg" left={left} total={exam.duration_min * 60} warn={left <= exam.warn_sec} /></div>
                <div className="bar"><i style={{ width: `${joined ? (submitted / joined) * 100 : 0}%`, background: "var(--mint)" }} /></div>
                <div className="row" style={{ justifyContent: "center" }}>
                  <button className="btn" disabled={busy} onClick={() => act("extend", 1)}>⏱ +1분</button>
                  <button className="btn" disabled={busy} onClick={() => act("extend", 5)}>⏱ +5분</button>
                </div>
                <button className="btn danger block lg" disabled={busy} onClick={() => act("end", 0, "전체 시험을 지금 종료할까요? 미제출자는 지금까지 저장된 답으로 자동 제출됩니다.")}>⏹ 전체 시험 종료</button>
              </>
            )}
            {status === "ended" && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/img/trophy.svg" alt="" style={{ width: 110, margin: "0 auto" }} />
                <h2 style={{ justifyContent: "center", margin: 0 }}>시험이 종료됐어요!</h2>
                <p className="muted" style={{ margin: 0 }}>학습자 폰에 점수·정답·해설이 공개됐어요.</p>
                {essay && <div className="info">{essay}</div>}
                <Link href={`/admin/exams/${id}/report`} className="btn pink block lg">📊 결과 대시보드 보기</Link>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card z1" style={{ marginTop: 18 }}>
        <h2>🙋 실시간 참여자 ({joined}명)</h2>
        {!joined ? <p className="muted">아직 입장한 사람이 없어요.</p> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>#</th><th>이름</th><th>소속</th><th>답한 문항</th><th>상태</th></tr></thead>
            <tbody>{live!.people.map((p, k) => (
              <tr key={k}><td>{k + 1}</td><td><b>{p.name}</b></td><td>{p.dept}</td><td>{p.answered} / {nq}</td>
                <td>{p.submitted ? <span className="chip ended">제출 완료</span> : status === "live" ? <span className="chip live">응시 중</span> : <span className="chip draft">대기</span>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
