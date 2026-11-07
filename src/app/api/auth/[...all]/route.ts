import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// 所有 /api/auth/* 請求（登入、註冊、登出、取得 session）都交給 Better Auth 處理
export const { GET, POST } = toNextJsHandler(auth);
