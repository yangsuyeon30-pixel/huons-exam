// 개인 리포트 메일 일괄 발송. Gmail(앱 비밀번호) 우선, 없으면 Resend. 둘 다 없으면 501 → 화면에서 설정 안내.
import nodemailer from "nodemailer";
import { personalReportHtml } from "@/lib/report";
import { rpc } from "@/lib/sb";
import { fail, HttpError, requireAdmin } from "@/lib/server";
import { computeStats } from "@/lib/stats";
import type { Results } from "@/lib/types";

export const maxDuration = 300;

type Mail = { to: string; subject: string; html: string };

function mailer(): { via: string; send: (m: Mail) => Promise<void> } | null {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  const fromName = process.env.MAIL_FROM_NAME ?? "휴온스 퀴즈 챌린지";
  if (user && pass) {
    const t = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    return { via: `Gmail (${user})`, send: async (m) => { await t.sendMail({ from: `"${fromName}" <${user}>`, ...m }); } };
  }
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const from = process.env.RESEND_FROM ?? `${fromName} <onboarding@resend.dev>`;
    return {
      via: "Resend",
      send: async (m) => {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html }),
        });
        if (!res.ok) throw new Error((await res.text()).slice(0, 200));
      },
    };
  }
  return null;
}

// 화면에서 발송 가능 여부 확인용
export async function GET() {
  const m = mailer();
  return Response.json({ configured: !!m, via: m?.via ?? null });
}

export async function POST(req: Request) {
  try {
    const pass = await requireAdmin(req);
    const m = mailer();
    if (!m) throw new HttpError(501, "메일 발송 계정이 아직 설정되지 않아 메일을 보내지 못했습니다");
    const { examId, attemptIds } = await req.json();
    const r = await rpc<Results>("hx_admin_results", { p: pass, p_id: examId });
    if (r.exam.status !== "ended") throw new HttpError(400, "시험이 종료된 뒤에 발송할 수 있습니다");
    const s = computeStats(r);
    const targets = r.attempts.filter((a) => a.email && (!attemptIds?.length || attemptIds.includes(a.id)));
    const sent: string[] = [];
    const failed: { name: string; error: string }[] = [];
    for (const a of targets) {
      try {
        await m.send({ to: a.email, subject: `[${r.exam.title}] ${a.name}님의 평가 결과 리포트`, html: personalReportHtml(r, a.id, s) });
        sent.push(a.id);
      } catch (e) {
        failed.push({ name: a.name, error: (e as Error).message.slice(0, 200) });
      }
      await new Promise((ok) => setTimeout(ok, 400)); // 발송 한도 보호
    }
    if (sent.length) await rpc("hx_admin_mark_emailed", { p: pass, p_ids: sent });
    return Response.json({ sent: sent.length, failed, via: m.via });
  } catch (e) {
    return fail(e);
  }
}
