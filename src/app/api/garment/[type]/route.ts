// 商品示意圖：用 SVG 依「款式 + 顏色」即時畫出衣服剪影。
// 作品集不需要買圖庫，也不用上傳圖片；之後換成真實商品照只要改 ProductImage.url。

const SHAPES: Record<string, string> = {
  tee: "M70 40 L100 28 Q120 42 140 28 L170 40 L198 78 L172 92 L162 80 L162 196 L78 196 L78 80 L68 92 L42 78 Z",
  longtee: "M70 40 L100 28 Q120 42 140 28 L170 40 L196 150 L176 156 L162 92 L162 196 L78 196 L78 92 L64 156 L44 150 Z",
  polo: "M70 40 L104 28 L120 52 L136 28 L170 40 L198 78 L172 92 L162 80 L162 196 L78 196 L78 80 L68 92 L42 78 Z M112 32 L120 52 L128 32",
  hoodie: "M72 44 Q90 10 120 12 Q150 10 168 44 L196 150 L176 156 L162 96 L162 196 L78 196 L78 96 L64 156 L44 150 Z M100 140 L140 140 L146 172 L94 172 Z",
  sweat: "M70 42 L102 30 Q120 44 138 30 L170 42 L196 150 L176 156 L162 96 L162 192 L78 192 L78 96 L64 156 L44 150 Z",
  shirt: "M72 38 L104 26 L120 46 L136 26 L168 38 L194 150 L174 156 L162 92 L162 198 L78 198 L78 92 L66 156 L46 150 Z M120 46 L120 198",
  blouse: "M72 42 L102 30 Q120 58 138 30 L168 42 Q192 60 190 92 L166 96 L160 84 L164 192 L76 192 L80 84 L74 96 L50 92 Q48 60 72 42 Z",
  jacket: "M68 40 L104 24 L120 40 L136 24 L172 40 L198 156 L176 162 L164 96 L164 200 L76 200 L76 96 L64 162 L42 156 Z M120 40 L120 200 M84 140 L108 140 M132 140 L156 140",
  vest: "M84 34 L106 26 Q120 50 134 26 L156 34 Q150 70 166 96 L166 196 L74 196 L74 96 Q90 70 84 34 Z M120 50 L120 196",
  cardigan: "M72 40 L104 28 L120 70 L136 28 L168 40 L194 150 L174 156 L162 94 L162 194 L78 194 L78 94 L66 156 L46 150 Z M120 70 L120 194",
  knit: "M70 40 Q120 18 170 40 L196 150 L176 156 L162 96 L162 192 L78 192 L78 96 L64 156 L44 150 Z M96 34 Q120 46 144 34",
  tank: "M88 30 L104 30 Q120 56 136 30 L152 30 Q150 70 162 96 L162 196 L78 196 L78 96 Q90 70 88 30 Z",
  dress: "M92 28 L106 28 Q120 48 134 28 L148 28 Q146 66 156 90 L190 210 L50 210 L84 90 Q94 66 92 28 Z M84 96 L156 96",
  skirt: "M84 50 L156 50 L158 64 L192 196 L48 196 L82 64 Z M84 64 L158 64",
  pants: "M80 30 L160 30 L166 210 L130 210 L120 96 L110 210 L74 210 Z M80 46 L160 46",
  shorts: "M78 60 L162 60 L172 160 L130 166 L120 110 L110 166 L68 160 Z M78 76 L162 76",
  cap: "M60 130 Q60 60 120 58 Q180 60 180 130 Z M60 130 L210 136 Q206 150 180 150 L60 146 Z M118 58 L122 58",
  beanie: "M64 150 Q62 64 120 60 Q178 64 176 150 Z M60 150 L180 150 L180 182 L60 182 Z M114 56 Q120 44 126 56",
  tote: "M60 90 L180 90 L172 206 L68 206 Z M92 90 Q92 40 120 40 Q148 40 148 90",
  sling: "M66 110 Q66 86 92 86 L148 86 Q174 86 174 110 L174 168 Q174 190 150 190 L90 190 Q66 190 66 168 Z M74 92 L40 30 M166 92 L200 30 M90 126 L150 126",
};

function isDark(hex: string) {
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
}

export async function GET(request: Request, ctx: RouteContext<"/api/garment/[type]">) {
  const { type } = await ctx.params;
  const raw = new URL(request.url).searchParams.get("c") ?? "9A9A9A";
  const color = /^[0-9a-fA-F]{6}$/.test(raw) ? raw : "9A9A9A";
  const path = SHAPES[type] ?? SHAPES.tee;
  const stroke = isDark(color) ? "#00000055" : "#00000030";
  const detail = isDark(color) ? "#ffffff30" : "#00000022";

  // 透明背景：衣服直接掛在洞洞板或任何底色上；加一點投影讓它像掛著
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
<defs><filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000" flood-opacity=".28"/></filter></defs>
<path d="${path}" fill="#${color}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" fill-rule="evenodd" filter="url(#s)"/>
<path d="${path}" fill="none" stroke="${detail}" stroke-width="1.2" stroke-dasharray="3 3" transform="translate(120 120) scale(0.94) translate(-120 -120)"/>
</svg>`;

  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
