// 교재 파일 → 텍스트 (브라우저에서 추출해 서버로는 텍스트만 보낸다: 대용량 PDF 도 업로드 한도에 안 걸림)
import JSZip from "jszip";

async function pdfText(buf: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(c.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return pages.join("\n\n");
}

async function docxText(buf: ArrayBuffer) {
  const mammoth = await import("mammoth");
  return (await mammoth.extractRawText({ arrayBuffer: buf })).value;
}

async function pptxText(buf: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  const out: string[] = [];
  for (const n of slides) {
    const xml = await zip.files[n].async("string");
    const t = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ");
    if (t.trim()) out.push(t);
  }
  return out.join("\n");
}

export async function extractText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const buf = await file.arrayBuffer();
  if (ext === "pdf") return pdfText(buf);
  if (ext === "docx") return docxText(buf);
  if (ext === "pptx") return pptxText(buf);
  if (ext === "txt" || ext === "md" || ext === "csv") return new TextDecoder().decode(buf);
  throw new Error(`${file.name}: PDF·DOCX·PPTX·TXT 파일만 지원합니다`);
}
