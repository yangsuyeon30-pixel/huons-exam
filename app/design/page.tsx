// 디자인 시스템 미리보기 (DESIGN.md 의 HTML 판) — 실제 앱과 같은 globals.css 를 쓴다
import { Deco, Ring, Who } from "@/components/ui";

const SW = [["--primary", "#0066b3"], ["--primary-2", "#29a3e0"], ["--coral", "#FF5A6E"], ["--mint", "#17b890"], ["--sun", "#ffb82e"], ["--sky", "#7fc4ec"], ["--ink", "#0f2340"], ["--ink-2", "#5a6b85"]];
const ASSETS = ["mascot", "hero", "heart", "capsule", "molecule", "star", "trophy", "alarm", "plane", "crown", "medal1", "medal2", "medal3"];

export default function DesignPage() {
  return (
    <div className="wrap">
      <Deco src="star" style={{ width: 90, right: 20, top: 20 }} />
      <h1 className="display" style={{ fontSize: 56 }}>디자인 <span className="accent">시스템</span></h1>
      <p className="hand" style={{ fontSize: 30 }}>«휴온스 퀴즈 챌린지» Clean Healthcare — DESIGN.md 구현본</p>

      <div className="grid2" style={{ marginTop: 20 }}>
        <div className="card"><h2>🎨 색</h2><div className="grid4">{SW.map(([n, c]) => (
          <div key={n}><div style={{ height: 56, borderRadius: 16, background: c }} /><b className="small">{n}</b><div className="muted small">{c}</div></div>))}</div></div>
        <div className="card stack"><h2>🔤 글꼴</h2>
          <div className="display" style={{ fontSize: 40 }}>디스플레이 <span className="accent">Pretendard 900</span></div>
          <div className="hand" style={{ fontSize: 32 }}>손글씨 Nanum Pen Script — 오늘도 한 문제 더! 💙</div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>본문 Pretendard 800 — Q. 우리 회사의 핵심 가치로 옳은 것은?</div>
          <div className="row wrapflex"><span className="note">메모지</span><span className="sticker">복수 선택 가능 ✓</span><span className="chip">칩</span><span className="chip beta">Beta</span><span className="chip live">진행 중</span><span className="chip ended">종료</span><span className="chip draft">준비</span></div>
        </div>
        <div className="card stack"><h2>🔘 버튼</h2>
          <div className="row wrapflex"><button className="btn primary">다음 문제 →</button><button className="btn pink">✨ AI로 문제 생성하기 →</button><button className="btn">‹ 이전</button><button className="btn danger">⏹ 전체 종료</button><button className="btn mint">완료</button><button className="btn ghost">고스트</button></div>
          <input className="input" placeholder="입력창" />
          <div className="bar"><i style={{ width: "40%" }} /></div>
        </div>
        <div className="card stack"><h2>⏱ 타이머·경고</h2>
          <div className="row"><Ring left={252} total={600} /><Ring left={48} total={600} warn /><Who name="이하늘" /></div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="toast-warn"><img src="/img/alarm.svg" alt="" />1분 남았어요! 서둘러요!</div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 18 }}>
        <div className="card qcard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mascot" src="/img/mascot.svg" alt="" />
          <div className="qhead"><span className="chip">복수정답</span></div>
          <p className="qstem">Q. 우리 회사의 핵심 가치로 옳은 것을 모두 고르세요.</p>
          {["고객 중심으로 생각하고 행동한다.", "데이터에 기반해 합리적으로 결정한다.", "실패를 두려워하지 않고 빠르게 도전한다.", "개인의 성과보다 팀의 성장을 우선한다."].map((t, k) => (
            <div key={k} className={`choice c${k} ${k % 2 === 0 ? "sel" : ""}`}><span className="letter">{"ABCD"[k]}</span><span className="txt">{t}</span><span className="box">{k % 2 === 0 ? "✓" : ""}</span></div>
          ))}
        </div>
        <div className="card"><h2>🧸 일러스트 에셋 (SVG)</h2>
          <div className="grid4">{ASSETS.map((a) => (
            // eslint-disable-next-line @next/next/no-img-element
            <div key={a} className="center"><img src={`/img/${a}.svg`} alt={a} style={{ width: "100%", maxWidth: 110 }} /><div className="muted small">{a}</div></div>))}</div>
        </div>
      </div>
    </div>
  );
}
