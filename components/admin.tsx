"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { adminPass, rpc } from "@/lib/sb";
import { Deco, Err, Spinner } from "./ui";

// 관리자 비밀번호 확인 후 children 렌더 (비밀번호는 탭 세션에만 보관)
export function AdminGate({ children }: { children: (pass: string) => React.ReactNode }) {
  const [pass, setPass] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = adminPass.get();
    if (!p) { setPass(""); return; }
    rpc<boolean>("hx_admin_login", { p }).then((ok) => setPass(ok ? p : "")).catch(() => setPass(""));
  }, []);

  if (pass === null) return <div className="wrap center" style={{ paddingTop: 120 }}><Spinner dark /></div>;
  if (pass) return <>{children(pass)}</>;

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      if (await rpc<boolean>("hx_admin_login", { p: input })) { adminPass.set(input); setPass(input); }
      else setErr("비밀번호가 올바르지 않습니다");
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="wrap" style={{ maxWidth: 460, paddingTop: 80 }}>
      <Deco src="star" style={{ width: 80, right: 0, top: 40 }} />
      <Deco src="crown" cls="d2" style={{ width: 64, left: 0, top: 70 }} />
      <h1 className="display center z1" style={{ fontSize: 40 }}>관리자 <span className="accent">로그인</span></h1>
      <form className="card stack z1" style={{ marginTop: 24 }} onSubmit={login}>
        <label className="field"><span>관리자 비밀번호</span>
          <input className="input" type="password" inputMode="numeric" autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="비밀번호" />
        </label>
        <Err msg={err} />
        <button className="btn primary block lg" disabled={busy || !input}>{busy ? <Spinner /> : "들어가기"}</button>
      </form>
    </div>
  );
}

export function AdminHeader({ title, crumbs = [] }: { title?: string; crumbs?: { href: string; label: string }[] }) {
  return (
    <header className="row between wrapflex noprint" style={{ marginBottom: 18 }}>
      <Link href="/admin" style={{ textDecoration: "none" }}>
        <div className="display" style={{ fontSize: 28 }}>휴온스 <span className="accent">퀴즈 챌린지</span></div>
      </Link>
      <nav className="row wrapflex small" style={{ fontWeight: 700 }}>
        {crumbs.map((c) => <Link key={c.href} href={c.href} className="chip" style={{ background: "#fff" }}>{c.label}</Link>)}
        {title && <span className="chip">{title}</span>}
        <button className="btn ghost sm" onClick={() => { adminPass.clear(); location.href = "/admin"; }}>로그아웃</button>
      </nav>
    </header>
  );
}

// 관리자용 API 호출 (비밀번호 헤더 첨부)
export async function adminFetch<T>(path: string, pass: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-pass": pass }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `요청 실패 (${res.status})` }));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `요청 실패 (${res.status})`), { status: res.status });
  return data as T;
}
