"use client";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { AdminGate, AdminHeader, adminFetch } from "@/components/admin";
import { Deco, Err, Spinner } from "@/components/ui";
import { extractText } from "@/lib/extract";
import { rpc } from "@/lib/sb";
import { TYPE_LABEL, type Exam, type QType, type Question } from "@/lib/types";

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdminGate>{(pass) => <Editor pass={pass} id={id} />}</AdminGate>;
}

const TYPES: { t: QType; label: string; icon: string; desc: string }[] = [
  { t: "single", label: "객관식", icon: "①", desc: "4지선다 · 정답 1개" },
  { t: "multi", label: "복수정답", icon: "✓✓", desc: "4지선다 · 정답 여러 개" },
  { t: "short", label: "단답형", icon: "Aa", desc: "용어·숫자로 답하기" },
  { t: "essay", label: "서술형", icon: "✎", desc: "2~4문장 서술 (AI 채점 초안)" },
];

type Meta = Pick<Exam, "title" | "course" | "duration_min" | "warn_sec" | "pass_score">;
type Mat = { name: string; size: number; chars: number; text: string };

function blank(type: QType): Question {
  return { type, stem: "", choices: type === "single" || type === "multi" ? ["", "", "", ""] : [], answer: [], explanation: "", points: type === "essay" ? 3 : type === "multi" ? 2 : 1 };
}

function Editor({ pass, id }: { pass: string; id: string }) {
  const [examId, setExamId] = useState(id === "new" ? "" : id);
  const [status, setStatus] = useState<Exam["status"]>("draft");
  const [meta, setMeta] = useState<Meta>({ title: "", course: "", duration_min: 20, warn_sec: 60, pass_score: 60 });
  const [qs, setQs] = useState<Question[]>([]);
  const [mats, setMats] = useState<Mat[]>([]);
  const [counts, setCounts] = useState<Record<QType, number>>({ single: 10, multi: 3, short: 4, essay: 1 });
  const [focus, setFocus] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("replace");
  const [busy, setBusy] = useState<"" | "read" | "gen" | "save">("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(id !== "new");
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id === "new") return;
    rpc<{ exam: Exam; questions: Question[] }>("hx_admin_get", { p: pass, p_id: id })
      .then(({ exam, questions }) => {
        setStatus(exam.status);
        setMeta({ title: exam.title, course: exam.course, duration_min: exam.duration_min, warn_sec: exam.warn_sec, pass_score: Number(exam.pass_score) });
        setQs(questions.map((q) => ({ ...q, points: Number(q.points) })));
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [id, pass]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("read"); setErr("");
    try {
      const out: Mat[] = [];
      for (const f of Array.from(files)) {
        if (f.size > 50 * 1024 * 1024) throw new Error(`${f.name}: 50MB 이하 파일만 올려 주세요`);
        const text = (await extractText(f)).replace(/[ \t]+/g, " ").trim();
        if (text.length < 20) throw new Error(`${f.name}: 글자를 읽지 못했어요(스캔 이미지 PDF일 수 있어요). 텍스트가 있는 파일로 올려 주세요`);
        out.push({ name: f.name, size: f.size, chars: text.length, text });
      }
      setMats((m) => [...m, ...out]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };

  const generate = async () => {
    setBusy("gen"); setErr(""); setMsg("");
    try {
      const material = mats.map((m) => `### ${m.name}\n${m.text}`).join("\n\n");
      const { questions } = await adminFetch<{ questions: Question[] }>("/api/generate", pass, { material, counts, focus });
      setQs((cur) => (mode === "append" ? [...cur, ...questions] : questions));
      setMsg(`AI가 ${questions.length}문항을 만들었어요. 아래에서 검토·수정한 뒤 저장해 주세요.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };

  const validate = () => {
    if (!meta.title.trim()) return "시험 제목을 입력해 주세요";
    for (const [k, q] of qs.entries()) {
      if (!q.stem.trim()) return `Q${k + 1}: 문제 내용이 비어 있어요`;
      if ((q.type === "single" || q.type === "multi") && q.choices.some((c) => !c.trim())) return `Q${k + 1}: 보기 4개를 모두 채워 주세요`;
      if (!q.answer.length) return `Q${k + 1}: 정답을 지정해 주세요`;
      if (q.type === "multi" && q.answer.length < 2) return `Q${k + 1}: 복수정답 문항은 정답을 2개 이상 지정해 주세요`;
    }
    return "";
  };

  const save = async (then?: "live") => {
    const v = validate();
    if (v) { setErr(v); return; }
    setBusy("save"); setErr(""); setMsg("");
    try {
      const newId = await rpc<string>("hx_admin_save", { p: pass, p_exam: { id: examId || null, ...meta }, p_questions: qs });
      setExamId(newId);
      if (!examId) history.replaceState(null, "", `/admin/exams/${newId}`);
      if (then === "live") location.href = `/admin/exams/${newId}/live`;
      else setMsg(status === "ended" ? "저장했어요. 정답이 바뀐 문항은 자동으로 재채점됐어요." : "저장했어요 ✨");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };

  const upd = (k: number, patch: Partial<Question>) => setQs((cur) => cur.map((q, j) => (j === k ? { ...q, ...patch } : q)));
  const move = (k: number, d: number) => setQs((cur) => { const a = [...cur]; const t = a[k + d]; if (!t) return a; a[k + d] = a[k]; a[k] = t; return a; });
  const total = counts.single + counts.multi + counts.short + counts.essay;

  if (loading) return <div className="wrap center"><Spinner dark /></div>;
  if (status === "live") return <div className="wrap"><AdminHeader /><div className="card">진행 중인 시험은 편집할 수 없어요. <Link href={`/admin/exams/${id}/live`}>진행 화면으로</Link></div></div>;

  return (
    <div className="wrap">
      <AdminHeader title={examId ? "문항 편집" : "새 챌린지"} crumbs={[{ href: "/admin", label: "← 시험 목록" }]} />
      <Deco src="star" style={{ width: 80, right: -10, top: 70 }} />

      <div className="grid2 z1" style={{ alignItems: "start" }}>
        <div className="card stack">
          <h2>📋 시험 정보</h2>
          <label className="field"><span>시험 제목</span><input className="input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="예) 2026 휴온스 직무역량 종합평가" /></label>
          <label className="field"><span>과정명</span><input className="input" value={meta.course} onChange={(e) => setMeta({ ...meta, course: e.target.value })} placeholder="예) 2026 휴온스 신입사원 입문교육" /></label>
          <div className="grid3">
            <label className="field"><span>제한시간(분)</span><input className="input" type="number" min={1} max={300} value={meta.duration_min} onChange={(e) => setMeta({ ...meta, duration_min: Number(e.target.value) })} /></label>
            <label className="field"><span>경고 시점(초 전)</span><input className="input" type="number" min={0} max={3600} value={meta.warn_sec} onChange={(e) => setMeta({ ...meta, warn_sec: Number(e.target.value) })} /></label>
            <label className="field"><span>합격 기준(점)</span><input className="input" type="number" min={0} max={100} value={meta.pass_score} onChange={(e) => setMeta({ ...meta, pass_score: Number(e.target.value) })} /></label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>점수는 배점 합계를 100점으로 환산해 보여줘요. 남은 시간이 경고 시점이 되면 학습자 폰에 빨간 경고가 떠요.</p>
        </div>

        <div className="card stack">
          <h2>✨ AI 문제 만들기 <span className="chip beta">Beta</span></h2>
          <div>
            <h3>1. 학습 자료 업로드</h3>
            <label className={`drop ${over ? "over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
              <input ref={fileRef} type="file" multiple hidden accept=".pdf,.docx,.pptx,.txt,.md" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              {busy === "read" ? <><Spinner dark /> <span className="muted">교재를 읽는 중…</span></> : (
                <><div style={{ fontSize: 30 }}>📄</div><b>PDF·PPTX·DOCX·TXT를 끌어놓거나 클릭해서 올려 주세요</b><div className="muted small">여러 파일 가능 · 파일당 최대 50MB</div></>
              )}
            </label>
            <div style={{ marginTop: 10 }}>
              {mats.map((m, k) => (
                <div className="filechip" key={k}>
                  <span className="ic">📘</span>
                  <span className="nm">{m.name}<div className="muted small">{(m.size / 1024 / 1024).toFixed(1)}MB · {m.chars.toLocaleString()}자 읽음</div></span>
                  <button className="btn ghost sm" onClick={() => setMats(mats.filter((_, j) => j !== k))} aria-label="삭제">✕</button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3>2. 문제 유형 및 개수 설정 <span className="muted small">(총 {total}문항)</span></h3>
            <div className="grid2" style={{ gap: 10 }}>
              {TYPES.map((x, k) => (
                <div className={`tile t${k}`} key={x.t}>
                  <div className="row"><span className="ic">{x.icon}</span><div style={{ flex: 1 }}><b>{x.label}</b><div className="muted small">{x.desc}</div></div>
                    <input className="num" type="number" min={0} max={50} value={counts[x.t]} onChange={(e) => setCounts({ ...counts, [x.t]: Math.max(0, Math.min(50, Number(e.target.value))) })} aria-label={`${x.label} 문항 수`} /></div>
                  <input type="range" min={0} max={30} value={Math.min(30, counts[x.t])} onChange={(e) => setCounts({ ...counts, [x.t]: Number(e.target.value) })} aria-label={`${x.label} 문항 수 슬라이더`} />
                </div>
              ))}
            </div>
          </div>
          <label className="field"><span>추가 요청 (선택)</span><input className="input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="예) 3장 핵심가치 위주로, 난이도는 중간" /></label>
          {qs.length > 0 && (
            <div className="row small" style={{ fontWeight: 700 }}>
              <label><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> 기존 문항 교체</label>
              <label><input type="radio" checked={mode === "append"} onChange={() => setMode("append")} /> 기존 문항 뒤에 추가</label>
            </div>
          )}
          <button className="btn pink block lg" disabled={!mats.length || total < 1 || !!busy} onClick={generate}>
            {busy === "gen" ? <><Spinner /> AI가 문제를 만드는 중… (1분 내외)</> : "✨ AI로 문제 생성하기 →"}
          </button>
        </div>
      </div>

      <div className="card z1" style={{ marginTop: 18 }}>
        <div className="row between wrapflex" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>📝 문항 검토·수정 <span className="muted small">{qs.length}문항 · 배점 합계 {qs.reduce((a, q) => a + Number(q.points), 0)}점</span></h2>
          <div className="row wrapflex">
            {TYPES.map((x) => <button key={x.t} className="btn ghost sm" onClick={() => setQs([...qs, blank(x.t)])}>＋ {x.label}</button>)}
          </div>
        </div>
        {qs.length === 0 && <p className="muted center">교재를 올리고 「AI로 문제 생성하기」를 누르거나, 위 버튼으로 직접 문항을 추가하세요.</p>}
        <div className="stack">
          {qs.map((q, k) => <QEdit key={k} k={k} q={q} upd={upd} move={move} del={() => setQs(qs.filter((_, j) => j !== k))} />)}
        </div>
      </div>

      <div className="row wrapflex z1" style={{ position: "sticky", bottom: 12, marginTop: 18, justifyContent: "flex-end" }}>
        {err && <div className="err" style={{ flex: 1 }}>{err}</div>}
        {msg && !err && <div className="info" style={{ flex: 1 }}>{msg}</div>}
        <button className="btn lg" disabled={!!busy} onClick={() => save()}>{busy === "save" ? <Spinner dark /> : "💾 저장"}</button>
        {status === "draft" && <button className="btn primary lg" disabled={!!busy || !qs.length} onClick={() => save("live")}>저장하고 시험 진행 화면으로 🚀</button>}
      </div>
    </div>
  );
}

function QEdit({ k, q, upd, move, del }: { k: number; q: Question; upd: (k: number, p: Partial<Question>) => void; move: (k: number, d: number) => void; del: () => void }) {
  const objective = q.type === "single" || q.type === "multi";
  const toggle = (i: number) => {
    if (q.type === "single") upd(k, { answer: [i] });
    else { const a = q.answer as number[]; upd(k, { answer: a.includes(i) ? a.filter((x) => x !== i) : [...a, i].sort() }); }
  };
  return (
    <div className="result-item" style={{ background: "rgba(255,255,255,.9)" }}>
      <div className="row between wrapflex">
        <div className="row">
          <b style={{ fontSize: 18 }}>Q{k + 1}</b>
          <select className="select" style={{ width: "auto", padding: "6px 10px" }} value={q.type}
            onChange={(e) => { const t = e.target.value as QType; upd(k, { ...blank(t), stem: q.stem, explanation: q.explanation, choices: (t === "single" || t === "multi") ? (q.choices.length === 4 ? q.choices : ["", "", "", ""]) : [] }); }}>
            {(Object.keys(TYPE_LABEL) as QType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <label className="small muted row" style={{ gap: 4 }}>배점 <input className="num" type="number" min={0.5} step={0.5} value={q.points} onChange={(e) => upd(k, { points: Number(e.target.value) })} /></label>
        </div>
        <div className="row">
          <button className="btn ghost sm" onClick={() => move(k, -1)} aria-label="위로">↑</button>
          <button className="btn ghost sm" onClick={() => move(k, 1)} aria-label="아래로">↓</button>
          <button className="btn ghost sm" onClick={del}>삭제</button>
        </div>
      </div>
      <textarea className="textarea" style={{ marginTop: 10, minHeight: 60 }} value={q.stem} onChange={(e) => upd(k, { stem: e.target.value })} placeholder="문제 내용" />
      {objective && (
        <div style={{ marginTop: 8 }}>
          {q.choices.map((c, i) => {
            const sel = (q.answer as number[]).includes(i);
            return (
              <div key={i} className={`choice c${i} ${sel ? "sel" : ""}`} style={{ cursor: "default", padding: 8, minHeight: 0 }}>
                <span className="letter">{"ABCD"[i]}</span>
                <input className="input" style={{ padding: "8px 12px" }} value={c} onChange={(e) => upd(k, { choices: q.choices.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`보기 ${"ABCD"[i]}`} />
                <button type="button" className="box" style={{ cursor: "pointer" }} onClick={() => toggle(i)} title="정답으로 지정" aria-label={`${"ABCD"[i]} 정답 지정`}>{sel ? "✓" : ""}</button>
              </div>
            );
          })}
          <p className="muted small" style={{ margin: "6px 0 0" }}>오른쪽 체크 = 정답{q.type === "multi" ? " (2개 이상)" : ""}</p>
        </div>
      )}
      {!objective && (
        <label className="field" style={{ marginTop: 8 }}><span>{q.type === "short" ? "허용 정답 (쉼표로 여러 개 — 띄어쓰기·대소문자는 무시하고 비교)" : "모범답안·채점 기준"}</span>
          <input className="input" key={`${k}-${q.type}-${(q.answer as string[]).join("|")}`} defaultValue={(q.answer as string[]).join(q.type === "short" ? ", " : "")}
            onBlur={(e) => upd(k, { answer: q.type === "short" ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : [e.target.value.trim()].filter(Boolean) })} />
        </label>
      )}
      <label className="field" style={{ marginTop: 8 }}><span>해설</span><textarea className="textarea" style={{ minHeight: 50 }} value={q.explanation} onChange={(e) => upd(k, { explanation: e.target.value })} /></label>
    </div>
  );
}
