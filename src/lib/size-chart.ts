// 尺寸表（公分）：商品頁和 AI 客服共用同一份，改這裡兩邊都會更新
export const SIZE_CHART: Record<"top" | "bottom", string[][]> = {
  top: [["尺寸", "胸寬", "衣長", "肩寬"], ["XS", "48", "62", "42"], ["S", "51", "65", "45"], ["M", "54", "68", "47"], ["L", "57", "71", "49"], ["XL", "60", "74", "51"]],
  bottom: [["尺寸", "腰圍", "臀圍", "褲長"], ["XS / 24-25", "62", "88", "96"], ["S / 26-28", "68", "92", "98"], ["M / 29-30", "74", "96", "100"], ["L / 32-34", "80", "100", "102"], ["XL / 36", "86", "104", "104"]],
};
const BOTTOMS = ["pants", "shorts", "skirt"];

// 這件商品用哪一張尺寸表；配件（帽子、包包）是單一尺寸，沒有尺寸表
export function sizeChartFor(garmentType: string, sizes: string[]) {
  if (sizes.every((s) => s === "F")) return null;
  return SIZE_CHART[BOTTOMS.includes(garmentType) ? "bottom" : "top"];
}
