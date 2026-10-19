"use client";
import { useEffect, useRef, useState } from "react";

// 서버 시각 기준 남은 초 (폰 시계가 틀려도 서버와 맞춘다)
export function useRemaining(endsAt: string | null | undefined, serverNow: string | null | undefined) {
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (serverNow) offset.current = Date.parse(serverNow) - Date.now();
  }, [serverNow]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((Date.parse(endsAt) - (now + offset.current)) / 1000));
}

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function Ring({ left, total, warn, size = "sm" }: { left: number; total: number; warn?: boolean; size?: "sm" | "lg" }) {
  const px = size === "lg" ? 160 : 74;
  const sw = size === "lg" ? 12 : 7;
  const r = (px - sw) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? left / total : 0;
  return (
    <div className={`ring ${size === "lg" ? "lg" : ""} ${warn ? "warn" : ""}`} role="timer" aria-label={`남은 시간 ${mmss(left)}`}>
      <svg width={px} height={px}>
        <circle cx={px / 2} cy={px / 2} r={r} fill="#fff" stroke="#ffe1e5" strokeWidth={sw} />
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke="var(--coral)" strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: "stroke-dashoffset .25s linear" }} />
      </svg>
      <b>{mmss(left)}</b>
    </div>
  );
}

export function Who({ name }: { name: string }) {
  return (
    <span className="who">
      <i>{name.slice(0, 1)}</i>
      <em>{name}</em>
    </span>
  );
}

export function Deco({ src, style, cls = "" }: { src: string; style: React.CSSProperties; cls?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`deco ${cls}`} src={`/img/${src}.svg`} alt="" aria-hidden style={style} />;
}

export function Spinner({ dark }: { dark?: boolean }) {
  return <span className={`spinner ${dark ? "dark" : ""}`} />;
}

export function Err({ msg }: { msg: string }) {
  return msg ? <div className="err">{msg}</div> : null;
}

// 일정 간격으로 fn 실행(탭이 숨겨지면 멈춤)
export function usePoll(fn: () => void, ms: number, deps: unknown[]) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    let alive = true;
    const tick = () => alive && document.visibilityState === "visible" && saved.current();
    tick();
    const t = setInterval(tick, ms);
    const vis = () => tick();
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
