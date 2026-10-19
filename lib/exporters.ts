// 브라우저 전용 내보내기: HTML·Word·PDF(인쇄)·CSV·개인 리포트 zip
import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import JSZip from "jszip";
import { chartsFor, overallReportHtml, personalReportHtml, summaryLines, weakItems } from "./report";
import { fmtSecs, type Stats } from "./stats";
import { fmtKey, TYPE_LABEL, type Results } from "./types";

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);

export function download(name: string, data: Blob | string, type = "text/html;charset=utf-8") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportHtml(r: Results, s: Stats) {
  download(`${safe(r.exam.title)}_결과보고서.html`, overallReportHtml(r, s));
}

export function printPdf(r: Results, s: Stats) {
  const w = window.open("", "_blank");
  if (!w) { alert("팝업이 차단됐어요. 팝업을 허용한 뒤 다시 눌러 주세요."); return; }
  w.document.write(overallReportHtml(r, s).replace("</body>", "<script>window.onload=()=>setTimeout(()=>print(),400)</script></body>"));
  w.document.close();
}

export function exportCsv(r: Results, s: Stats) {
  const head = ["순위", "이름", "소속", "이메일", "점수(100)", "원점수", "합격", "소요시간", ...r.questions.map((q) => `Q${q.no}`)];
  const rows = s.ranked.map((x) => {
    const a = r.attempts.find((y) => y.id === x.id)!;
    return [x.rank, x.name, x.dept, x.email, x.score, x.raw, x.pass ? "합격" : "미달", fmtSecs(x.secs), ...r.questions.map((q) => a.graded?.[q.id]?.earned ?? 0)];
  });
  const csv = [head, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  download(`${safe(r.exam.title)}_성적.csv`, "﻿" + csv, "text/csv;charset=utf-8");
}

export async function exportPersonalZip(r: Results, s: Stats) {
  const zip = new JSZip();
  r.attempts.forEach((a) => zip.file(`${safe(a.name)}_${a.id.slice(0, 4)}_개인리포트.html`, personalReportHtml(r, a.id, s)));
  download(`${safe(r.exam.title)}_개인리포트.zip`, await zip.generateAsync({ type: "blob" }));
}

async function svgToPng(svg: string): Promise<{ data: ArrayBuffer; w: number; h: number }> {
  const img = new Image();
  const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
  const w = Number(m[1]), h = Number(m[2]);
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = w * 2; c.height = h * 2;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((ok) => c.toBlob((b) => ok(b!), "image/png"));
  return { data: await blob.arrayBuffer(), w, h };
}

const P = (text: string, opt: { bold?: boolean; size?: number; color?: string } = {}) =>
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text, bold: opt.bold, size: opt.size ?? 21, color: opt.color, font: "맑은 고딕" })] });
const H = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, children: [new TextRun({ text, font: "맑은 고딕", bold: true, size: 28, color: "5B3FD9" })] });
function T(rows: (string | number)[][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, i) => new TableRow({
      tableHeader: i === 0,
      children: row.map((c) => new TableCell({
        shading: i === 0 ? { fill: "EFE9FF" } : undefined,
        children: [new Paragraph({ children: [new TextRun({ text: String(c), bold: i === 0, size: 18, font: "맑은 고딕" })] })],
      })),
    })),
  });
}

export async function exportDocx(r: Results, s: Stats) {
  const charts = chartsFor(s);
  const img = async (svg: string, width = 600) => {
    const p = await svgToPng(svg);
    return new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: p.data, transformation: { width, height: Math.round((width * p.h) / p.w) } })] });
  };
  const e = r.exam;
  const doc = new Document({
    styles: { default: { document: { run: { font: "맑은 고딕" } } } },
    sections: [{
      children: [
        P(`${e.course} · 평가 결과 보고서`, { color: "6B6790" }),
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: e.title, bold: true, size: 40, font: "맑은 고딕" })] }),
        P(`시행 ${e.started_at ? new Date(e.started_at).toLocaleString("ko-KR") : "-"} · 제한시간 ${e.duration_min}분 · ${r.questions.length}문항 · 합격 기준 ${e.pass_score}점`, { color: "6B6790" }),
        H("1. 핵심 요약"), ...summaryLines(s, r).map((l) => P(`• ${l}`)),
        H("2. 핵심 지표"),
        T([["응시자", "평균", "중앙값", "표준편차", "최고/최저", "Q1~Q3", "합격률", "KR-20"],
          [`${s.n}명`, `${s.avg}점`, `${s.med}점`, s.sd, `${s.maxScore}/${s.min}`, `${s.q1}~${s.q3}`, `${s.passRate}%`, s.kr20]]),
        H("3. 점수 분포"), await img(charts.hist),
        H("4. 문항별 정답률"), await img(charts.items),
        H("5. 유형별 정답률"), await img(charts.types, 400),
        H("6. 취약 문항"), T([["문항", "유형", "내용", "정답률", "변별도"], ...weakItems(s).map((i) => [`Q${i.no}`, TYPE_LABEL[i.type], i.stem, `${i.rate}%`, i.disc])]),
        H("7. 문항 분석"), T([["문항", "정답", "정답률", "변별도"], ...r.questions.map((q, k) => [`Q${q.no}. ${q.stem}`, fmtKey(q), `${s.items[k].rate}%`, s.items[k].disc])]),
        H("8. 응시자 성적표"), T([["순위", "이름", "소속", "점수", "결과", "소요시간"], ...s.ranked.map((x) => [x.rank, x.name, x.dept, x.score, x.pass ? "합격" : "미달", fmtSecs(x.secs)])]),
      ],
    }],
  });
  download(`${safe(e.title)}_결과보고서.docx`, await Packer.toBlob(doc));
}
