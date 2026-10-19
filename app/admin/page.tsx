"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminGate, AdminHeader } from "@/components/admin";
import { Deco, Err, Spinner } from "@/components/ui";
import { rpc } from "@/lib/sb";
import { STATUS_LABEL, type ExamStatus } from "@/lib/types";

type Row = { id: string; code: string; title: string; course: string; status: ExamStatus; duration_min: number; created_at: string; n_questions: number; n_attempts: number };

export default function AdminHome() {
  return <AdminGate>{(pass) => <List pass={pass} />}</AdminGate>;
}

function List({ pass }: { pass: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => rpc<Row[]>("hx_admin_list", { p: pass }).then(setRows).catch((e) => setErr(e.message)), [pass]);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: string, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try {
      const r = await rpc<{ id?: string }>("hx_admin_action", { p: pass, p_id: id, p_action: action, p_min: 0 });
      if (r?.id) location.href = `/admin/exams/${r.id}`;
      else load();
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="wrap">
      <AdminHeader />
      <Deco src="star" style={{ width: 90, right: 10, top: 90 }} />
      <Deco src="capsule" cls="d2" style={{ width: 72, right: 140, top: 150 }} />
      <section className="row between wrapflex z1" style={{ margin: "26px 0 18px" }}>
        <div>
          <h1 className="display" style={{ fontSize: 46 }}>나의 <span className="accent">챌린지</span></h1>
          <p className="hand" style={{ fontSize: 28, margin: "6px 0 0" }}>교재만 올리면 AI가 문제를 뚝딱! ✨</p>
        </div>
        <Link href="/admin/exams/new" className="btn pink lg">＋ 새 챌린지 만들기</Link>
      </section>
      <Err msg={err} />
      {!rows ? <div className="center"><Spinner dark /></div> : rows.length === 0 ? (
        <div className="card center z1"><p className="muted">아직 만든 시험이 없어요. 오른쪽 위 버튼으로 첫 챌린지를 만들어 보세요!</p></div>
      ) : (
        <div className="grid3 z1">
          {rows.map((r) => (
            <div className="card stack" key={r.id}>
              <div className="row between">
                <span className={`chip ${r.status}`}>{r.status === "live" ? "● " : ""}{STATUS_LABEL[r.status]}</span>
                <span className="muted small">코드 {r.code}</span>
              </div>
              <div>
                <div className="muted small" style={{ fontWeight: 700 }}>{r.course || "과정 미지정"}</div>
                <h3 style={{ fontSize: 19, margin: "2px 0 0" }}>{r.title || "(제목 없음)"}</h3>
              </div>
              <div className="row small muted" style={{ fontWeight: 700 }}>
                <span>📝 {r.n_questions}문항</span><span>⏱ {r.duration_min}분</span><span>👥 {r.n_attempts}명</span>
              </div>
              <div className="row wrapflex">
                {r.status !== "live" && <Link className="btn sm" href={`/admin/exams/${r.id}`}>✏️ 문항 편집</Link>}
                <Link className="btn primary sm" href={`/admin/exams/${r.id}/live`}>{r.status === "draft" ? "🚀 시험 진행" : r.status === "live" ? "📡 진행 화면" : "🔁 진행 화면"}</Link>
                {r.status !== "draft" && <Link className="btn pink sm" href={`/admin/exams/${r.id}/report`}>📊 결과</Link>}
              </div>
              <div className="row wrapflex small">
                <button className="btn ghost sm" onClick={() => act(r.id, "duplicate")}>복제</button>
                {r.status !== "draft" && <button className="btn ghost sm" onClick={() => act(r.id, "reset", "응시 기록을 모두 지우고 준비 상태로 되돌릴까요?")}>초기화</button>}
                <button className="btn ghost sm" onClick={() => act(r.id, "delete", `「${r.title}」 시험과 모든 응시 기록을 삭제할까요?`)}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
