// 서버(API 라우트) 전용 도우미
import { GoogleGenAI } from "@google/genai";
import { rpc } from "./sb";

export const MODEL = "gemini-3.8-flash";

export function gemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 가 설정되지 않았습니다");
  return new GoogleGenAI({ apiKey });
}

export async function requireAdmin(req: Request) {
  const pass = req.headers.get("x-admin-pass") ?? "";
  const ok = await rpc<boolean>("hx_admin_login", { p: pass });
  if (!ok) throw new HttpError(401, "관리자 비밀번호가 올바르지 않습니다");
  return pass;
}

export class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

export function fail(e: unknown) {
  const status = e instanceof HttpError ? e.status : 500;
  console.error(e);
  return Response.json({ error: e instanceof Error ? e.message : "처리 중 오류가 발생했습니다" }, { status });
}
