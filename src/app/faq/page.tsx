import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { STORE } from "@/lib/store-config";

export const metadata: Metadata = { title: "常見問題" };

// 客服中心：像攤位旁邊貼的一張張告示
export default async function FaqPage() {
  const faqs = await prisma.faq.findMany({ orderBy: { sortOrder: "asc" } });
  const groups = [...new Set(faqs.map((f) => f.category))];

  return (
    <div className="pegboard pt-10 pb-16">
      <div className="mx-auto max-w-3xl px-4">
        <div className="kraft-tag inline-block -rotate-1 px-5 py-3">
          <h1 className="text-3xl font-black">常見問題</h1>
        </div>
        <nav aria-label="問題分類" className="mt-6 flex flex-wrap gap-2 text-sm">
          {groups.map((g) => (
            <a key={g} href={`#${g}`} className="rounded-sm bg-card px-3 py-1.5 font-bold shadow-sm hover:bg-white">
              {g}
            </a>
          ))}
        </nav>
        {groups.map((g, gi) => (
          <section key={g} id={g} className="mt-10 scroll-mt-8">
            <h2 className="inline-block rounded-sm bg-ink px-3 py-1 text-lg font-black text-white">{g}</h2>
            <div className="card mt-3 divide-y divide-line" style={{ transform: `rotate(${gi % 2 ? 0.3 : -0.3}deg)` }}>
              {faqs.filter((f) => f.category === g).map((f) => (
                <details key={f.id} className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-start gap-3 font-bold [&::-webkit-details-marker]:hidden">
                    <svg aria-hidden viewBox="0 0 12 12" className="mt-1.5 h-3 w-3 shrink-0 transition-transform group-open:rotate-90">
                      <path d="M4 2 L8.5 6 L4 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f.question}
                  </summary>
                  <p className="mt-2 pl-6 text-sm leading-relaxed text-ink/80">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
        <div className="neon-card mt-12 rotate-1 p-6 text-sm">
          <p className="text-lg font-black">找不到答案？直接問我們</p>
          <p className="mt-2">電話 {STORE.servicePhone}（{STORE.serviceHours}）・Email {STORE.serviceEmail}</p>
        </div>
      </div>
    </div>
  );
}
