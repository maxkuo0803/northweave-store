import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { prisma } from "./prisma";
import { isDemoEmail } from "./store-config";

// 展示帳號不能呼叫的 API：改密碼、改資料、登出別人的裝置、刪帳號
// （網頁上的按鈕已經擋了，這裡是擋「直接打 API」的人）
const DEMO_BLOCKED_PATHS = [
  "/change-password",
  "/set-password",
  "/update-user",
  "/change-email",
  "/delete-user",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
];

// Better Auth 設定：Email + 密碼登入、admin 角色管理
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "mysql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      phone: { type: "string", required: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 天
    updateAge: 60 * 60 * 24, // 每天自動延長一次
  },
  // 限流：防止有人用程式狂試密碼。存在資料庫，因為 Vercel 會開很多台機器
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 300, max: 10 },
      "/sign-up/email": { window: 3600, max: 5 },
      "/change-password": { window: 300, max: 5 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!DEMO_BLOCKED_PATHS.includes(ctx.path)) return;
      const session = await getSessionFromCtx(ctx);
      if (isDemoEmail(session?.user.email)) {
        throw new APIError("FORBIDDEN", { message: "展示帳號不能修改" });
      }
    }),
  },
  // admin plugin 只給 role = admin 使用（staff 展示帳號不能用來改別人的角色、停權等）
  // nextCookies 必須放最後：讓 Server Action 裡呼叫登入/登出時能寫入 cookie
  plugins: [admin({ adminRoles: ["admin"] }), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
