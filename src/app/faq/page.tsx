import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { STORE } from "@/lib/store-config";

export const metadata: Metadata = { title: "常見問題" };

export default async function FaqPage() {
  const faqs = await prisma.faq.findMany({ orderBy: { sortOrder: "asc" } });
  const groups = [...new Set(faqs.map((f) => f.category))];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">客服中心・常見問題</h1>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {groups.map((g) => <a key={g} href={`#${g}`} className="rounded-full border border-line bg-card px-3 py-1">{g}</a>)}
      </div>
      {groups.map((g) => (
        <section key={g} id={g} className="mt-10 scroll-mt-32">
          <h2 className="text-lg font-bold">{g}</h2>
          <div className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
            {faqs.filter((f) => f.category === g).map((f) => (
              <details key={f.id} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="mr-2 text-brand group-open:rotate-90">›</span>{f.question}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <div className="card mt-12 p-6 text-sm">
        <p className="font-bold">找不到答案？</p>
        <p className="mt-2 text-muted">客服電話 {STORE.servicePhone}（{STORE.serviceHours}）・Email {STORE.serviceEmail}</p>
      </div>
    </div>
  );
}
