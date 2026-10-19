"use client";
import Link from "next/link";
import { useState } from "react";
import { Deco } from "@/components/ui";

export default function Home() {
  const [code, setCode] = useState("");
  return (
    <div className="wrap" style={{ maxWidth: 1100, paddingTop: 40 }}>
      <Deco src="star" style={{ width: 96, right: 40, top: 40 }} />
      <Deco src="molecule" cls="d3" style={{ width: 90, right: 440, top: 30 }} />
      <Deco src="capsule" cls="d2" style={{ width: 80, right: 10, bottom: 20 }} />
      <div className="grid2 z1" style={{ alignItems: "center" }}>
        <div>
          <p className="hand" style={{ fontSize: 32, margin: 0 }}>배우고, 풀고, 함께 성장하는 휴온스人</p>
          <h1 className="display" style={{ fontSize: "clamp(48px, 8vw, 84px)", margin: "10px 0" }}>휴온스<br /><span className="accent">퀴즈 챌린지</span></h1>
          <p style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.6 }} className="muted">교재만 올리면 AI가 문제를 만들고, 강의장에서 QR로 폰 시험,<br />끝나자마자 채점·해설·결과 보고서까지 한 번에.</p>
          <form className="card row wrapflex" style={{ marginTop: 20 }} onSubmit={(e) => { e.preventDefault(); if (code.trim()) location.href = `/e/${code.trim().toUpperCase()}`; }}>
            <input className="input" style={{ flex: 1, minWidth: 160, fontSize: 20, fontWeight: 800, letterSpacing: 2 }} value={code} onChange={(e) => setCode(e.target.value)} placeholder="입장 코드 6자리" maxLength={6} aria-label="입장 코드" />
            <button className="btn primary lg">학습자 입장 →</button>
          </form>
          <div className="row wrapflex" style={{ marginTop: 14 }}>
            <Link href="/admin" className="btn pink lg">관리자 모드</Link>
            <span className="note" style={{ fontSize: 22 }}>오늘도 한 문제 더, 건강한 성장 💙</span>
          </div>
        </div>
        <div className="center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/hero.svg" alt="" style={{ width: "min(100%, 440px)", filter: "drop-shadow(0 20px 30px rgba(0, 60, 120,.25))" }} />
        </div>
      </div>
    </div>
  );
}
