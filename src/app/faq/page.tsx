import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { STORE } from "@/lib/store-config";

export const metadata: Metadata = { title: "常見問題" };

// 客服中心：像攤位旁邊貼的一張張告示
export default async function FaqPage() {
  const faqs = await prisma.faq.findMany({ orderBy: { sortOrder: "asc" } });
  const groups = [...new Set(faqs.map((f) => f.category))];

  return (
    <div className="pt-10 pb-8 md:pt-14">
      <div className="mx-auto max-w-3xl px-5">
        <h1 className="display text-[clamp(36px,5vw,64px)] leading-[1.05]">常見問題</h1>
        <p className="mt-3 text-sm text-muted">找不到答案的話，點右下角問小織，或直接聯絡我們。</p>
        <nav aria-label="問題分類" className="mt-8 flex flex-wrap gap-2 text-sm">
          {groups.map((g) => (
            <a key={g} href={`#${g}`} className="rounded-full border border-ink/15 bg-white/60 px-4 py-1.5 font-bold transition-colors hover:border-ink">
              {g}
            </a>
          ))}
        </nav>
        {groups.map((g) => (
          <section key={g} id={g} className="mt-14 scroll-mt-32">
            <h2 className="display text-2xl">{g}</h2>
            <div className="mt-4 divide-y divide-line border-y border-line">
              {faqs.filter((f) => f.category === g).map((f) => (
                <details key={f.id} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-start gap-3 font-bold [&::-webkit-details-marker]:hidden">
                    <svg aria-hidden viewBox="0 0 12 12" className="mt-1.5 h-3 w-3 shrink-0 transition-transform group-open:rotate-90">
                      <path d="M4 2 L8.5 6 L4 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f.question}
                  </summary>
                  <p className="mt-3 pl-6 text-[15px] leading-relaxed text-ink/75">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
        <div className="neon-card mt-16 p-8 text-sm">
          <p className="display text-2xl">找不到答案？直接問我們</p>
          <p className="mt-2">電話 {STORE.servicePhone}（{STORE.serviceHours}）・Email {STORE.serviceEmail}</p>
        </div>
      </div>
    </div>
  );
}
