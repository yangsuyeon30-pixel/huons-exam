// 종합 리포트·개인 리포트 HTML (외부 의존 없는 단일 파일: 다운로드·인쇄(PDF)·메일 본문에 그대로 쓴다)
import { computeStats, fmtSecs, type Stats } from "./stats";
import { fmtAnswer, fmtKey, TYPE_LABEL, type Results } from "./types";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "-");

// ── SVG 차트 (Word 변환 시 PNG 로 래스터화) ──
export function barSvg(labels: string[], values: number[], opt: { max?: number; color?: string; unit?: string; w?: number; h?: number } = {}) {
  const w = opt.w ?? 640, h = opt.h ?? 240, pad = 34, bw = (w - pad * 2) / Math.max(1, values.length);
  const max = opt.max ?? Math.max(1, ...values);
  const bars = values.map((v, i) => {
    const bh = ((h - pad * 2) * v) / max;
    const x = pad + i * bw + bw * 0.15, y = h - pad - bh;
    return `<rect x="${x}" y="${y}" width="${bw * 0.7}" height="${bh}" rx="5" fill="${opt.color ?? "#0066b3"}"/>
<text x="${x + bw * 0.35}" y="${y - 5}" font-size="11" text-anchor="middle" fill="#0f2340">${v}${opt.unit ?? ""}</text>
<text x="${x + bw * 0.35}" y="${h - pad + 15}" font-size="10" text-anchor="middle" fill="#5a6b85">${esc(labels[i])}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Pretendard, 'Malgun Gothic', sans-serif">
<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#d6e3f0"/>${bars.join("")}</svg>`;
}

export function chartsFor(s: Stats) {
  return {
    hist: barSvg(["0", "10", "20", "30", "40", "50", "60", "70", "80", "90"], s.hist, { color: "#0066b3", unit: "명" }),
    items: barSvg(s.items.map((i) => `Q${i.no}`), s.items.map((i) => i.rate), { max: 100, color: "#17b890", unit: "%" }),
    types: barSvg(s.byType.map((t) => TYPE_LABEL[t.type]), s.byType.map((t) => t.rate), { max: 100, color: "#29a3e0", unit: "%", w: 420 }),
  };
}

const CSS = `body{font-family:Pretendard,'Malgun Gothic',sans-serif;color:#0f2340;max-width:900px;margin:0 auto;padding:32px 24px;line-height:1.6}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 10px;padding-left:10px;border-left:5px solid #0066b3}
.muted{color:#5a6b85}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.kpi{background:#eef5fc;border-radius:14px;padding:12px 14px}
.kpi b{display:block;font-size:24px}.kpi span{font-size:12px;color:#5a6b85}table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border-bottom:1px solid #e3ecf5;padding:7px 6px;text-align:left;vertical-align:top}th{background:#f5f9fd}
.ok{color:#1F9E78;font-weight:700}.ng{color:#E0465A;font-weight:700}.box{background:#f9fbfe;border:1px solid #e3ecf5;border-radius:12px;padding:12px 14px;margin:8px 0}
svg{max-width:100%;height:auto}@media print{body{padding:0}h2{break-after:avoid}.box,tr{break-inside:avoid}}`;

const wrap = (title: string, body: string) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"><style>${CSS}</style></head><body>${body}</body></html>`;

export function weakItems(s: Stats, n = 5) {
  return [...s.items].sort((a, b) => a.rate - b.rate).slice(0, n);
}

export function summaryLines(s: Stats, r: Results) {
  const weak = weakItems(s, 3).map((i) => `Q${i.no}(${i.rate}%)`).join(", ");
  const lowDisc = s.items.filter((i) => i.disc < 0.2).length;
  return [
    `응시자 ${s.n}명의 평균은 ${s.avg}점(중앙값 ${s.med}점, 표준편차 ${s.sd}점)이며, 합격 기준 ${r.exam.pass_score}점 대비 합격률은 ${s.passRate}%입니다.`,
    `정답률이 가장 낮은 문항은 ${weak || "-"}로, 해당 내용은 후속 학습에서 보강이 필요합니다.`,
    s.sd >= 15 ? `점수 편차가 큰 편(σ=${s.sd})이라 학습 수준 차이가 뚜렷합니다. 하위 그룹 대상 보충 학습을 권합니다.` : `점수 편차(σ=${s.sd})가 크지 않아 전반적으로 고른 이해도를 보였습니다.`,
    lowDisc ? `변별도 0.2 미만 문항이 ${lowDisc}개 있어, 다음 회차 출제 시 난이도·보기 조정을 검토하세요.` : `모든 문항의 변별도가 0.2 이상으로 문항 품질이 양호합니다.`,
  ];
}

export function overallReportHtml(r: Results, s: Stats = computeStats(r), charts = chartsFor(s)) {
  const e = r.exam;
  const weak = weakItems(s);
  return wrap(`${e.title} 결과 보고서`, `
<p class="muted">${esc(e.course)} · 평가 결과 보고서</p><h1>${esc(e.title)}</h1>
<p class="muted">시행 ${fmtDate(e.started_at)} · 제한시간 ${e.duration_min}분 · 문항 ${r.questions.length}개(${s.max}점 만점 → 100점 환산) · 합격 기준 ${e.pass_score}점</p>
<h2>1. 핵심 요약</h2><ul>${summaryLines(s, r).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<h2>2. 핵심 지표</h2><div class="kpis">
<div class="kpi"><span>응시자</span><b>${s.n}명</b></div><div class="kpi"><span>평균</span><b>${s.avg}점</b></div>
<div class="kpi"><span>표준편차</span><b>${s.sd}</b></div><div class="kpi"><span>합격률</span><b>${s.passRate}%</b></div>
<div class="kpi"><span>중앙값</span><b>${s.med}점</b></div><div class="kpi"><span>최고 / 최저</span><b>${s.maxScore} / ${s.min}</b></div>
<div class="kpi"><span>사분위(Q1~Q3)</span><b>${s.q1}~${s.q3}</b></div><div class="kpi"><span>신뢰도(KR-20)</span><b>${s.kr20}</b></div></div>
<h2>3. 점수 분포</h2>${charts.hist}
<h2>4. 문항별 정답률</h2>${charts.items}
<h2>5. 유형별 정답률</h2>${charts.types}
<h2>6. 취약 문항 Top ${weak.length}</h2><table><tr><th>문항</th><th>유형</th><th>내용</th><th>정답률</th><th>변별도</th></tr>
${weak.map((i) => `<tr><td>Q${i.no}</td><td>${TYPE_LABEL[i.type]}</td><td>${esc(i.stem)}</td><td>${i.rate}%</td><td>${i.disc}</td></tr>`).join("")}</table>
<h2>7. 문항 분석</h2><table><tr><th>문항</th><th>정답</th><th>정답률</th><th>변별도</th><th>보기 선택(A/B/C/D)</th></tr>
${r.questions.map((q, k) => { const it = s.items[k]; return `<tr><td>Q${q.no}. ${esc(q.stem)}</td><td>${esc(fmtKey(q))}</td><td>${it.rate}%</td><td>${it.disc}</td><td>${q.choices.length ? it.choiceDist.join(" / ") : "-"}</td></tr>`; }).join("")}</table>
<h2>8. 응시자 성적표</h2><table><tr><th>순위</th><th>이름</th><th>소속</th><th>점수</th><th>결과</th><th>소요시간</th></tr>
${s.ranked.map((x) => `<tr><td>${x.rank}</td><td>${esc(x.name)}</td><td>${esc(x.dept)}</td><td>${x.score}</td><td class="${x.pass ? "ok" : "ng"}">${x.pass ? "합격" : "미달"}</td><td>${fmtSecs(x.secs)}</td></tr>`).join("")}</table>
<p class="muted" style="margin-top:28px;font-size:12px">작성 ${fmtDate(new Date().toISOString())} · 휴온스 퀴즈 챌린지 플랫폼</p>`);
}

export function personalReportHtml(r: Results, attemptId: string, s: Stats = computeStats(r)) {
  const a = r.attempts.find((x) => x.id === attemptId)!;
  const me = s.ranked.find((x) => x.id === attemptId)!;
  const top = s.n ? Math.max(1, Math.round((me.rank / s.n) * 100)) : 100;
  return wrap(`${a.name}님 개인 결과 리포트`, `
<p class="muted">${esc(r.exam.course)} · 개인 결과 리포트</p><h1>${esc(a.name)}님의 ${esc(r.exam.title)} 결과</h1>
<div class="kpis"><div class="kpi"><span>내 점수</span><b>${me.score}점</b></div><div class="kpi"><span>순위</span><b>${me.rank} / ${s.n}</b></div>
<div class="kpi"><span>상위</span><b>${top}%</b></div><div class="kpi"><span>전체 평균</span><b>${s.avg}점</b></div></div>
<p><b class="${me.pass ? "ok" : "ng"}">${me.pass ? "합격" : "합격 기준 미달"}</b> (기준 ${r.exam.pass_score}점) · 정답 ${r.questions.filter((q) => a.graded?.[q.id]?.correct).length} / ${r.questions.length}문항</p>
<h2>문항별 결과</h2>
${r.questions.map((q) => {
  const g = a.graded?.[q.id];
  const ok = g?.correct;
  return `<div class="box"><b>Q${q.no}. [${TYPE_LABEL[q.type]}]</b> ${esc(q.stem)} <span class="${ok ? "ok" : "ng"}">${ok ? "✔ 정답" : g?.pending ? "채점 대기" : "✘ 오답"}</span> (${g?.earned ?? 0}/${q.points}점)
${ok ? "" : `<div>내 답: ${esc(fmtAnswer(q, a.answers?.[q.id]))}</div><div><b>정답:</b> ${esc(fmtKey(q))}</div>`}
<div class="muted">해설: ${esc(q.explanation)}</div></div>`;
}).join("")}
<p class="muted" style="font-size:12px">작성 ${fmtDate(new Date().toISOString())}</p>`);
}

