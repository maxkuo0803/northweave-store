import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { prisma } from "./prisma";

// Better Auth 設定：Email + 密碼登入、admin 角色管理
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "mysql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
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
  // nextCookies 必須放最後：讓 Server Action 裡呼叫登入/登出時能寫入 cookie
  plugins: [admin(), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
