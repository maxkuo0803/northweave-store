import Link from "next/link";

// 找不到頁面：攤位上一個空掛鉤
export default function NotFound() {
  return (
    <div className="pegboard px-4 py-20">
      <div className="mx-auto max-w-md text-center">
        <svg aria-hidden viewBox="0 0 24 34" className="mx-auto h-16 w-10 text-rail">
          <path d="M12 0 V10 Q12 17 6 17 Q1 17 1 12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M12 10 V34" stroke="currentColor" strokeWidth="2" />
        </svg>
        <div className="kraft-tag mx-auto mt-2 w-72 -rotate-2 px-5 pt-6 pb-5">
          <p className="font-marker text-5xl leading-none">404</p>
          <p className="mt-3 text-lg font-black">這個掛鉤是空的</p>
          <p className="mt-1 text-sm">網址可能打錯了，或這件已經下架、這筆訂單不是你的。</p>
        </div>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/products" className="btn-primary">回去逛商品</Link>
          <Link href="/account/orders" className="btn-outline">查我的訂單</Link>
        </div>
      </div>
    </div>
  );
}
