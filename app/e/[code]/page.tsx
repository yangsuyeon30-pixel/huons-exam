"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { rpc } from "@/lib/sb";
import { TYPE_LABEL, type QType } from "@/lib/types";
import { Deco, Err, Ring, Spinner, Who, mmss, usePoll, useRemaining } from "@/components/ui";
import Result, { type MyResult } from "./Result";

type PubQ = { id: string; no: number; type: QType; stem: string; choices: string[]; points: number };
type Pub = {
  id: string; code: string; title: string; course: string; status: "draft" | "live" | "ended";
  duration_min: number; warn_sec: number; ends_at: string | null; server_now: string; n_questions: number; questions: PubQ[];
};
type Me = { attempt_id: string; token: string; name: string };
type Ans = Record<string, number[] | string>;

const LK = (code: string) => `hx_att_${code.toUpperCase()}`;

export default function LearnerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [pub, setPub] = useState<Pub | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [answers, setAnswers] = useState<Ans>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<MyResult | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LK(code));
      if (raw) setMe(JSON.parse(raw));
    } catch { /* 저장소 차단 시 새로 입장 */ }
  }, [code]);

  // 이어하기: 서버에 저장된 답안·제출 여부 복원
  useEffect(() => {
    if (!me) return;
    rpc<{ answers: Ans; submitted_at: string | null } | null>("hx_attempt_state", { p_attempt: me.attempt_id, p_token: me.token })
      .then((s) => {
        if (!s) { localStorage.removeItem(LK(code)); setMe(null); return; }
        setAnswers(s.answers ?? {});
        setSubmitted(!!s.submitted_at);
      })
      .catch((e) => setErr(e.message));
  }, [me, code]);

  const loadPub = useCallback(async () => {
    const pending = result?.items.some((x) => x.pending);
    if (result && !pending) return; // 채점이 끝난 결과까지 받았으면 더 묻지 않는다
    try {
      const p = result ? pub! : await rpc<Pub | null>("hx_exam_public", { p_code: code });
      setPub(p);
      if (p?.status === "ended" && me) {
        const r = await rpc<MyResult>("hx_my_result", { p_attempt: me.attempt_id, p_token: me.token });
        if (r.status === "ended") setResult(r);
      }
    } catch (e) { setErr((e as Error).message); }
  }, [code, me, result, pub]);

  const done = pub?.status === "ended" && (!!result || !me);
  usePoll(loadPub, pub?.status === "live" && !submitted ? 4000 : 2500, [loadPub, done, submitted, pub?.status]);

  if (pub === undefined) return <Center><Spinner dark /></Center>;
  if (pub === null) return <Center><div className="card center"><h2>시험을 찾을 수 없어요 🥲</h2><p className="muted">QR 코드나 링크를 다시 확인해 주세요.</p></div></Center>;

  if (!me) {
    if (pub.status === "ended") return <Center><div className="card center"><h2>이미 종료된 시험이에요</h2></div></Center>;
    return <Join pub={pub} onJoined={(m) => { localStorage.setItem(LK(code), JSON.stringify(m)); setMe(m); }} />;
  }
  if (pub.status === "ended") return result ? <Result r={result} /> : <Center><Spinner dark /><p className="muted">결과를 불러오는 중…</p></Center>;
  if (pub.status === "draft") return <Waiting pub={pub} name={me.name} />;
  if (submitted) return <Submitted pub={pub} name={me.name} />;
  return (
    <>
      {err && <div className="phone" style={{ minHeight: 0, paddingBottom: 0 }}><Err msg={err} /></div>}
      <Exam pub={pub} me={me} answers={answers} setAnswers={setAnswers} onSubmitted={() => setSubmitted(true)} />
    </>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="phone" style={{ display: "grid", placeItems: "center", textAlign: "center" }}><div className="stack">{children}</div></div>;
}

function Join({ pub, onJoined }: { pub: Pub; onJoined: (m: Me) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dept, setDept] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await rpc<{ attempt_id: string; token: string }>("hx_join", { p_code: pub.code, p_name: name, p_email: email, p_dept: dept });
      onJoined({ ...r, name: name.trim() });
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="phone">
      <Deco src="star" style={{ width: 70, right: 4, top: 30 }} />
      <Deco src="capsule" cls="d2" style={{ width: 60, left: -4, top: 170 }} />
      <div className="z1" style={{ paddingTop: 30 }}>
        <span className="chip">{pub.course || "휴온스 평가"}</span>
        <h1 className="display" style={{ fontSize: 44, marginTop: 12 }}>휴온스<br /><span className="accent">퀴즈 챌린지</span></h1>
        <p className="hand" style={{ fontSize: 28, margin: "10px 0 0" }}>{pub.title}</p>
        <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 -24px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/hero.svg" alt="" style={{ width: 210, filter: "drop-shadow(0 14px 22px rgba(0, 60, 120,.25))" }} />
        </div>
        <form className="card stack" onSubmit={submit}>
          <label className="field"><span>이름</span><input className="input" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 홍길동" autoComplete="name" /></label>
          <label className="field"><span>이메일 (결과 리포트를 보내드려요)</span><input className="input" required type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="email" inputMode="email" /></label>
          <label className="field"><span>소속 (선택)</span><input className="input" maxLength={60} value={dept} onChange={(e) => setDept(e.target.value)} placeholder="예) 인사팀" /></label>
          <Err msg={err} />
          <button className="btn primary block lg" disabled={busy}>{busy ? <Spinner /> : "챌린지 입장하기 →"}</button>
          <p className="muted small center" style={{ margin: 0 }}>총 {pub.n_questions}문항 · 제한시간 {pub.duration_min}분</p>
        </form>
      </div>
    </div>
  );
}

function Waiting({ pub, name }: { pub: Pub; name: string }) {
  return (
    <div className="phone">
      <div className="topbar row between"><span className="chip">{pub.course || "휴온스 평가"}</span><Who name={name} /></div>
      <Deco src="star" style={{ width: 64, right: 10, top: 120 }} />
      <div className="z1 center" style={{ paddingTop: 40 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="deco" src="/img/mascot.svg" alt="" style={{ position: "relative", width: 180 }} />
        <h1 className="display" style={{ fontSize: 40, marginTop: 10 }}>곧 시작해요! 👀</h1>
        <p className="muted" style={{ fontWeight: 700 }}>강사님이 시작 버튼을 누르면 문제가 자동으로 나와요.<br />화면을 켜 둔 채 잠시만 기다려 주세요.</p>
        <div className="card" style={{ marginTop: 20 }}>
          <h3>{pub.title}</h3>
          <p className="muted small" style={{ margin: 0 }}>총 {pub.n_questions}문항 · 제한시간 {pub.duration_min}분 · 제출 후 정답은 시험이 끝나면 공개돼요</p>
        </div>
        <div style={{ marginTop: 26 }}><span className="note" style={{ fontSize: 22 }}>오늘도 한 문제 더! 🔥</span></div>
      </div>
    </div>
  );
}

function Submitted({ pub, name }: { pub: Pub; name: string }) {
  const left = useRemaining(pub.ends_at, pub.server_now) ?? 0;
  return (
    <div className="phone">
      <div className="topbar row between"><span className="chip">{pub.title}</span><Who name={name} /></div>
      <div className="z1 center" style={{ paddingTop: 50 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="flyaway" src="/img/plane.svg" alt="" style={{ width: 120 }} />
        <h1 className="display" style={{ fontSize: 40, marginTop: 10 }}>제출 완료! 🎉</h1>
        <p className="muted" style={{ fontWeight: 700 }}>수고하셨어요. 결과와 해설은<br />시험이 끝나면 이 화면에 바로 나타나요.</p>
        <div className="card" style={{ marginTop: 18 }}>
          <p className="muted small" style={{ margin: "0 0 4px" }}>시험 종료까지</p>
          <div className="bigcount" style={{ fontSize: 48 }}>{mmss(left)}</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="deco" src="/img/mascot.svg" alt="" style={{ position: "relative", width: 120, marginTop: 20 }} />
      </div>
    </div>
  );
}

function Exam({ pub, me, answers, setAnswers, onSubmitted }: {
  pub: Pub; me: Me; answers: Ans; setAnswers: React.Dispatch<React.SetStateAction<Ans>>; onSubmitted: () => void;
}) {
  const qs = pub.questions;
  const [i, setI] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const left = useRemaining(pub.ends_at, pub.server_now) ?? 0;
  const total = pub.duration_min * 60;
  const warn = left <= pub.warn_sec;
  const latest = useRef(answers);
  latest.current = answers;
  const dirty = useRef(false);
  const autoSent = useRef(false);

  // 저장은 한 번에 하나씩 순서대로(앞 저장이 끝난 뒤 최신 답을 보낸다) + 일련번호로 서버에서도 순서 보장
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const seq = useRef(Date.now());
  const save = useCallback((submit: boolean) => {
    const run = queue.current.catch(() => {}).then(async () => {
      dirty.current = false;
      seq.current = Math.max(seq.current + 1, Date.now());
      const r = await rpc<{ ok: boolean; reason?: string }>("hx_save", {
        p_attempt: me.attempt_id, p_token: me.token, p_answers: latest.current, p_submit: submit, p_seq: seq.current,
      });
      if (submit || r.reason === "submitted") onSubmitted();
      return r;
    });
    queue.current = run;
    return run;
  }, [me, onSubmitted]);

  // 자동 저장(0.6초 디바운스)
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => save(false).catch(() => { dirty.current = true; setErr("저장이 잠시 실패했어요. 네트워크를 확인해 주세요."); }), 600);
    return () => clearTimeout(t);
  }, [answers, save]);

  // 시간 종료 직전 자동 제출
  useEffect(() => {
    if (left <= 2 && left > 0 && !autoSent.current) {
      autoSent.current = true;
      save(true).catch(() => {});
    }
  }, [left, save]);

  if (!qs.length) return <Center><Spinner dark /></Center>;
  const q = qs[Math.min(i, qs.length - 1)];
  const v = answers[q.id];
  const isAnswered = (x: unknown) => (Array.isArray(x) ? x.length > 0 : typeof x === "string" && x.trim().length > 0);
  const nDone = qs.filter((x) => isAnswered(answers[x.id])).length;

  const set = (val: number[] | string) => { dirty.current = true; setErr(""); setAnswers((a) => ({ ...a, [q.id]: val })); };
  const pick = (k: number) => {
    if (q.type === "single") set([k]);
    else { const cur = Array.isArray(v) ? v : []; set(cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k].sort()); }
  };
  const last = i === qs.length - 1;
  const go = (n: number) => { if (dirty.current) save(false).catch(() => {}); setI(n); }; // 문항 이동 시 즉시 저장
  const doSubmit = async () => {
    setBusy(true);
    try { await save(true); } catch (e) { setErr((e as Error).message); setBusy(false); setConfirm(false); }
  };

  return (
    <div className="phone">
      <div className="topbar">
        <div className="row between">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pub.title} 🎉</div>
            <div className="muted small" style={{ fontWeight: 700 }}>{q.no}/{qs.length} 문제 · {nDone}개 답함</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Who name={me.name} />
            <Ring left={left} total={total} warn={warn} />
          </div>
        </div>
        <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${((i + 1) / qs.length) * 100}%` }} /></div>
        {warn && left > 0 && (
          <div className="toast-warn" role="alert">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/alarm.svg" alt="" />{left >= 60 ? `${Math.ceil(left / 60)}분` : `${left}초`} 남았어요! 서둘러요!
          </div>
        )}
      </div>

      <div className="card qcard z1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mascot" src="/img/mascot.svg" alt="" />
        <div className="qhead">
          <span className="chip">{TYPE_LABEL[q.type]}</span>
          <span className="chip" style={{ background: "#fff" }}>{q.points}점</span>
        </div>
        <p className="qstem">Q{q.no}. {q.stem}</p>
        {q.type === "multi" && <div style={{ margin: "10px 0 4px" }}><span className="sticker">복수 선택 가능 ✓</span></div>}
        <div style={{ marginTop: 14 }}>
          {(q.type === "single" || q.type === "multi") && q.choices.map((c, k) => {
            const sel = Array.isArray(v) && v.includes(k);
            return (
              <button key={k} type="button" className={`choice c${k % 4} ${sel ? "sel" : ""} ${q.type === "single" ? "round" : ""}`} onClick={() => pick(k)} aria-pressed={sel}>
                <span className="letter">{"ABCD"[k]}</span><span className="txt">{c}</span><span className="box">{sel ? "✓" : ""}</span>
              </button>
            );
          })}
          {q.type === "short" && (
            <input className="input" value={typeof v === "string" ? v : ""} onChange={(e) => set(e.target.value)} placeholder="정답을 입력하세요" maxLength={200} style={{ fontSize: 18 }} />
          )}
          {q.type === "essay" && (
            <textarea className="textarea" value={typeof v === "string" ? v : ""} onChange={(e) => set(e.target.value)} placeholder="2~4문장으로 자유롭게 서술하세요" maxLength={3000} style={{ minHeight: 180 }} />
          )}
        </div>
      </div>

      <div className="card z1" style={{ marginTop: 14, padding: 14 }}>
        <div className="qdots">
          {qs.map((x, k) => (
            <button key={x.id} type="button" className={`${isAnswered(answers[x.id]) ? "done" : ""} ${k === i ? "cur" : ""}`} onClick={() => go(k)}>{x.no}</button>
          ))}
        </div>
      </div>
      {err && <div style={{ marginTop: 10 }}><Err msg={err} /></div>}

      <div className="bottomnav">
        <div className="inner">
          <button type="button" className="btn" disabled={i === 0} onClick={() => go(i - 1)}>‹ 이전</button>
          {last
            ? <button type="button" className="btn pink lg" onClick={() => setConfirm(true)}>제출하기 🚀</button>
            : <button type="button" className="btn primary lg" onClick={() => go(i + 1)}>다음 문제 →</button>}
        </div>
      </div>

      {confirm && (
        <div className="modal-bg" onClick={() => !busy && setConfirm(false)}>
          <div className="card modal stack center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/plane.svg" alt="" style={{ width: 90, margin: "0 auto" }} />
            <h2 style={{ justifyContent: "center" }}>제출할까요?</h2>
            <p className="muted" style={{ margin: 0 }}>
              {qs.length - nDone > 0 ? <><b className="ng">{qs.length - nDone}문항</b>이 아직 비어 있어요.<br /></> : "모든 문항에 답했어요! "}
              제출하면 답을 바꿀 수 없어요.
            </p>
            {qs.length - nDone > 0 && (
              <p className="small muted" style={{ margin: 0 }}>빈 문항: {qs.filter((x) => !isAnswered(answers[x.id])).map((x) => `Q${x.no}`).join(", ")}</p>
            )}
            <div className="row">
              <button className="btn ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setConfirm(false)}>계속 풀기</button>
              <button className="btn pink" style={{ flex: 1 }} disabled={busy} onClick={doSubmit}>{busy ? <Spinner /> : "제출하기"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

