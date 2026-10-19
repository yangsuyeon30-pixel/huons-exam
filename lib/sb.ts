import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_KEY 가 설정되지 않았습니다");

export const sb = createClient(url, key, { auth: { persistSession: false } });

// 모든 데이터 접근은 hx_ RPC 로만 한다(테이블은 RLS 로 잠겨 있음)
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message === "unauthorized" ? "관리자 비밀번호가 올바르지 않습니다" : error.message);
  return data as T;
}

const PASS_KEY = "hx_admin_pass";
export const adminPass = {
  get: () => (typeof window === "undefined" ? "" : sessionStorage.getItem(PASS_KEY) ?? ""),
  set: (p: string) => sessionStorage.setItem(PASS_KEY, p),
  clear: () => sessionStorage.removeItem(PASS_KEY),
};
