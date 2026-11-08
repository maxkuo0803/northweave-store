/**
 * 假資料產生器：npm run db:seed
 * 會清空資料庫，重新建立商品、會員、訂單、退換貨、評論、FAQ。
 * 用固定亂數種子，每次產生的資料都一樣，方便 demo 與測試。
 *
 * Demo 帳號（測試用）：
 *   一般會員  demo@northweave.test   / Demo1234!
 *   管理員    admin@northweave.test  / Admin1234!
 *   其他假會員的密碼都是 Password123!
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { fakerZH_TW as faker } from "@faker-js/faker";
import { hashPassword } from "better-auth/crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import type {
  Gender,
  OrderStatus,
  PaymentMethod,
  ReturnReason,
  ReturnStatus,
  ReturnType,
  ShippingMethod,
} from "../src/generated/prisma/enums";
import { RETURN_WINDOW_DAYS, SHIPPING, garmentImageUrl, shippingFeeFor } from "../src/lib/store-config";
import { dbConfig } from "../src/lib/db-config";

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbConfig()) });
faker.seed(20261107);

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);
const addHours = (date: Date, h: number) => new Date(date.getTime() + h * 60 * 60 * 1000);
const pick = <T>(arr: readonly T[]) => faker.helpers.arrayElement(arr);

// ───────────── 顏色與分類 ─────────────

const COLORS = {
  oat: { name: "燕麥白", hex: "#E9E2D3" },
  black: { name: "墨黑", hex: "#1F1F1F" },
  grey: { name: "霧灰", hex: "#9A9A9A" },
  navy: { name: "海軍藍", hex: "#24324A" },
  olive: { name: "橄欖綠", hex: "#6B6B3A" },
  brick: { name: "磚紅", hex: "#A2483A" },
  mocha: { name: "奶茶棕", hex: "#B08D6E" },
  sky: { name: "天空藍", hex: "#8FB3D9" },
  sage: { name: "鼠尾草綠", hex: "#9CAF88" },
  taro: { name: "芋紫", hex: "#A694B8" },
  mustard: { name: "芥末黃", hex: "#D2A73C" },
  khaki: { name: "卡其", hex: "#C3B091" },
} as const;
type ColorKey = keyof typeof COLORS;

const CATEGORIES = [
  { slug: "men", name: "男裝", children: [
    { slug: "men-tops", name: "上衣" },
    { slug: "men-shirts", name: "襯衫" },
    { slug: "men-outerwear", name: "外套" },
    { slug: "men-bottoms", name: "褲裝" },
  ] },
  { slug: "women", name: "女裝", children: [
    { slug: "women-tops", name: "上衣" },
    { slug: "women-knit", name: "針織" },
    { slug: "women-dresses", name: "洋裝" },
    { slug: "women-skirts", name: "裙裝" },
    { slug: "women-bottoms", name: "褲裝" },
  ] },
  { slug: "accessories", name: "配件", children: [
    { slug: "acc-caps", name: "帽子" },
    { slug: "acc-bags", name: "包款" },
  ] },
];

const MATERIAL = {
  cotton: { material: "100% 精梳棉", care: "30°C 以下冷水洗，反面晾乾，勿烘乾" },
  heavyCotton: { material: "100% 棉（240g 重磅）", care: "冷水手洗或洗衣袋，反面晾乾" },
  oxford: { material: "100% 棉牛津布", care: "冷水洗，中溫熨燙" },
  linen: { material: "55% 亞麻 45% 棉", care: "冷水手洗，平放陰乾，可能輕微縮水" },
  fleece: { material: "80% 棉 20% 聚酯纖維（內刷毛）", care: "反面冷水洗，勿漂白，勿烘乾" },
  nylon: { material: "100% 尼龍（防潑水塗層）", care: "冷水手洗，勿熨燙，勿乾洗" },
  denim: { material: "98% 棉 2% 彈性纖維", care: "反面冷水洗，首次洗滌可能褪色，請單獨洗" },
  twill: { material: "97% 棉 3% 彈性纖維斜紋布", care: "冷水洗，中溫熨燙" },
  knit: { material: "70% 棉 30% 羊毛", care: "手洗或洗衣袋輕柔模式，平放陰乾" },
  rayon: { material: "100% 嫘縈", care: "冷水手洗，勿擰乾，低溫熨燙" },
  canvas: { material: "100% 棉帆布（12 安）", care: "局部擦拭清潔，勿機洗" },
};

type ProductSeed = {
  name: string;
  cat: string;
  type: string;
  gender: Gender;
  price: number;
  sale?: number;
  mat: keyof typeof MATERIAL;
  colors: ColorKey[];
  sizes?: string[];
  desc: string;
  featured?: boolean;
};

const ADULT = ["S", "M", "L", "XL"];
const WOMEN = ["XS", "S", "M", "L"];
const FREE = ["F"];

const PRODUCTS: ProductSeed[] = [
  // 男裝上衣
  { name: "重磅素面短袖 T 恤", cat: "men-tops", type: "tee", gender: "MEN", price: 690, mat: "heavyCotton", colors: ["oat", "black", "grey", "navy"], desc: "240g 重磅棉，厚實不透，領口加固羅紋不易變形。寬鬆落肩版型，單穿或內搭都好看。", featured: true },
  { name: "日常圓領短袖 T 恤", cat: "men-tops", type: "tee", gender: "MEN", price: 390, mat: "cotton", colors: ["oat", "black", "sky", "sage"], desc: "輕薄透氣的基本款，合身剪裁，夏天最好穿的一件。" },
  { name: "口袋寬版長袖 T 恤", cat: "men-tops", type: "longtee", gender: "MEN", price: 790, sale: 590, mat: "heavyCotton", colors: ["oat", "olive", "navy"], desc: "胸前貼袋設計，袖口羅紋收邊。春秋單穿、冬天內搭都適合。" },
  { name: "華夫格長袖上衣", cat: "men-tops", type: "longtee", gender: "MEN", price: 890, mat: "cotton", colors: ["oat", "mocha", "grey"], desc: "立體華夫格紋理，保暖又有質感，休閒風格必備。" },
  { name: "刷毛連帽大學 T", cat: "men-tops", type: "hoodie", gender: "MEN", price: 1290, mat: "fleece", colors: ["grey", "black", "navy", "brick"], desc: "內刷毛保暖不悶熱，雙層帽身挺版有型，袋鼠口袋實用。", featured: true },
  { name: "素面圓領大學 T", cat: "men-tops", type: "sweat", gender: "MEN", price: 990, sale: 790, mat: "fleece", colors: ["grey", "oat", "olive"], desc: "經典圓領大學 T，落肩寬鬆版型，簡單搭配牛仔褲就很好看。" },
  { name: "條紋短袖 POLO 衫", cat: "men-tops", type: "polo", gender: "MEN", price: 890, mat: "cotton", colors: ["navy", "oat", "olive"], desc: "細條紋針織 POLO，比 T 恤正式、比襯衫輕鬆，上班休閒兩相宜。" },
  // 男裝襯衫
  { name: "牛津布長袖襯衫", cat: "men-shirts", type: "shirt", gender: "MEN", price: 1190, mat: "oxford", colors: ["sky", "oat", "navy"], desc: "經典牛津布，越洗越柔軟。扣領設計，可正式可休閒。", featured: true },
  { name: "亞麻混紡短袖襯衫", cat: "men-shirts", type: "shirt", gender: "MEN", price: 1090, sale: 890, mat: "linen", colors: ["oat", "sage", "khaki"], desc: "亞麻透氣涼爽，開領設計帶點度假感，夏天通勤的好選擇。" },
  { name: "法蘭絨格紋襯衫", cat: "men-shirts", type: "shirt", gender: "MEN", price: 1290, mat: "cotton", colors: ["brick", "navy", "olive"], desc: "雙面刷毛法蘭絨，溫暖柔軟。可當襯衫外套敞開穿。" },
  { name: "丹寧工作襯衫", cat: "men-shirts", type: "shirt", gender: "MEN", price: 1490, mat: "denim", colors: ["navy", "sky"], desc: "雙胸袋工裝設計，耐穿耐磨，越穿越有自己的味道。" },
  // 男裝外套
  { name: "防潑水教練外套", cat: "men-outerwear", type: "jacket", gender: "MEN", price: 1890, mat: "nylon", colors: ["black", "navy", "olive"], desc: "防潑水尼龍面料，內裡網布透氣。按扣前襟，下擺抽繩可調整。", featured: true },
  { name: "工裝夾克", cat: "men-outerwear", type: "jacket", gender: "MEN", price: 2290, sale: 1790, mat: "twill", colors: ["khaki", "olive", "black"], desc: "四口袋工裝設計，厚挺斜紋布，春秋季節的主力外套。" },
  { name: "刷毛立領外套", cat: "men-outerwear", type: "jacket", gender: "MEN", price: 1690, mat: "fleece", colors: ["oat", "grey", "mocha"], desc: "搖粒絨立領外套，輕量保暖，露營、通勤都實用。" },
  { name: "輕量羽絨背心", cat: "men-outerwear", type: "vest", gender: "MEN", price: 1590, mat: "nylon", colors: ["black", "navy"], desc: "90/10 羽絨填充，可收納成小包，冬天疊穿最方便。" },
  // 男裝褲
  { name: "彈性直筒牛仔褲", cat: "men-bottoms", type: "pants", gender: "MEN", price: 1490, mat: "denim", colors: ["navy", "black", "sky"], sizes: ["28", "30", "32", "34", "36"], desc: "微彈丹寧，直筒版型修飾腿型，久坐也舒適。", featured: true },
  { name: "寬版工作褲", cat: "men-bottoms", type: "pants", gender: "MEN", price: 1390, mat: "twill", colors: ["khaki", "black", "olive"], sizes: ["28", "30", "32", "34", "36"], desc: "寬鬆直筒剪裁，側邊立體口袋，街頭感十足。" },
  { name: "休閒束口棉褲", cat: "men-bottoms", type: "pants", gender: "MEN", price: 990, sale: 790, mat: "fleece", colors: ["grey", "black", "navy"], desc: "鬆緊腰頭加抽繩，褲口束口設計，在家外出都好穿。" },
  { name: "斜紋休閒短褲", cat: "men-bottoms", type: "shorts", gender: "MEN", price: 790, mat: "twill", colors: ["khaki", "navy", "olive", "black"], desc: "膝上長度，斜紋布挺而不硬，夏天必備短褲。" },
  // 女裝上衣
  { name: "短版圓領 T 恤", cat: "women-tops", type: "tee", gender: "WOMEN", price: 490, mat: "cotton", colors: ["oat", "black", "taro", "sky"], sizes: WOMEN, desc: "短版設計拉長比例，搭配高腰褲裙最剛好。", featured: true },
  { name: "寬鬆落肩 T 恤", cat: "women-tops", type: "tee", gender: "WOMEN", price: 590, mat: "heavyCotton", colors: ["oat", "grey", "sage"], sizes: WOMEN, desc: "oversize 落肩版型，慵懶又有型，可紮可放。" },
  { name: "泡泡袖棉麻上衣", cat: "women-tops", type: "blouse", gender: "WOMEN", price: 890, sale: 690, mat: "linen", colors: ["oat", "sky", "mustard"], sizes: WOMEN, desc: "微泡泡袖修飾手臂線條，棉麻材質透氣，溫柔氣質款。" },
  { name: "V 領雪紡襯衫", cat: "women-tops", type: "blouse", gender: "WOMEN", price: 990, mat: "rayon", colors: ["oat", "black", "taro"], sizes: WOMEN, desc: "垂墜嫘縈面料，V 領顯臉小，上班約會都適合。" },
  { name: "條紋長袖襯衫", cat: "women-tops", type: "shirt", gender: "WOMEN", price: 1090, mat: "oxford", colors: ["sky", "brick"], sizes: WOMEN, desc: "經典藍白條紋，寬鬆版型可當外搭罩衫。" },
  { name: "連帽短版大學 T", cat: "women-tops", type: "hoodie", gender: "WOMEN", price: 1190, mat: "fleece", colors: ["grey", "taro", "sage", "oat"], sizes: WOMEN, desc: "短版連帽設計，下擺羅紋收邊，配裙子褲子都可愛。" },
  // 女裝針織
  { name: "羅紋針織背心", cat: "women-knit", type: "tank", gender: "WOMEN", price: 590, mat: "knit", colors: ["oat", "black", "mocha"], sizes: WOMEN, desc: "細羅紋針織，貼身不緊繃，單穿或疊穿都好看。" },
  { name: "圓領針織開襟外套", cat: "women-knit", type: "cardigan", gender: "WOMEN", price: 1490, sale: 1190, mat: "knit", colors: ["oat", "mocha", "sage", "taro"], sizes: WOMEN, desc: "軟糯針織開襟衫，冷氣房必備，珍珠釦增添細節。", featured: true },
  { name: "高領針織毛衣", cat: "women-knit", type: "knit", gender: "WOMEN", price: 1590, mat: "knit", colors: ["oat", "black", "brick"], sizes: WOMEN, desc: "棉羊毛混紡不刺癢，高領保暖，冬天的基本款。" },
  { name: "麻花紋寬鬆毛衣", cat: "women-knit", type: "knit", gender: "WOMEN", price: 1790, mat: "knit", colors: ["oat", "khaki", "grey"], sizes: WOMEN, desc: "經典麻花紋，寬鬆版型包容度高，溫暖又有份量感。" },
  // 女裝洋裝
  { name: "亞麻綁帶長洋裝", cat: "women-dresses", type: "dress", gender: "WOMEN", price: 1690, mat: "linen", colors: ["oat", "sage", "khaki"], sizes: WOMEN, desc: "腰間綁帶修飾身形，亞麻自然垂墜，度假感滿分。", featured: true },
  { name: "碎花方領洋裝", cat: "women-dresses", type: "dress", gender: "WOMEN", price: 1590, sale: 1290, mat: "rayon", colors: ["sky", "mustard", "taro"], sizes: WOMEN, desc: "法式方領露出鎖骨，小碎花圖案溫柔浪漫。" },
  { name: "T 恤式休閒洋裝", cat: "women-dresses", type: "dress", gender: "WOMEN", price: 990, mat: "cotton", colors: ["black", "grey", "oat"], sizes: WOMEN, desc: "像 T 恤一樣好穿的洋裝，一件就搞定今天的穿搭。" },
  { name: "背心針織洋裝", cat: "women-dresses", type: "dress", gender: "WOMEN", price: 1390, mat: "knit", colors: ["black", "mocha"], sizes: WOMEN, desc: "合身針織背心裙，內搭 T 恤或單穿都有不同風格。" },
  // 女裝裙
  { name: "百褶中長裙", cat: "women-skirts", type: "skirt", gender: "WOMEN", price: 1190, mat: "rayon", colors: ["black", "khaki", "navy"], sizes: WOMEN, desc: "細百褶設計走路飄逸，鬆緊腰頭好穿脫。" },
  { name: "丹寧 A 字短裙", cat: "women-skirts", type: "skirt", gender: "WOMEN", price: 990, sale: 790, mat: "denim", colors: ["navy", "sky", "black"], sizes: WOMEN, desc: "A 字版型修飾臀腿，高腰設計顯腿長。" },
  { name: "亞麻開衩長裙", cat: "women-skirts", type: "skirt", gender: "WOMEN", price: 1290, mat: "linen", colors: ["oat", "olive"], sizes: WOMEN, desc: "側開衩設計增加行走空間，自然休閒的長裙。" },
  // 女裝褲
  { name: "高腰寬褲", cat: "women-bottoms", type: "pants", gender: "WOMEN", price: 1290, mat: "twill", colors: ["black", "khaki", "oat"], sizes: WOMEN, desc: "高腰打褶設計，寬鬆垂墜修飾腿型，通勤百搭。", featured: true },
  { name: "彈性直筒牛仔褲", cat: "women-bottoms", type: "pants", gender: "WOMEN", price: 1390, mat: "denim", colors: ["navy", "sky", "black"], sizes: ["24", "25", "26", "27", "28", "29"], desc: "高彈丹寧，直筒版型不挑腿型，舒適好活動。" },
  { name: "亞麻鬆緊短褲", cat: "women-bottoms", type: "shorts", gender: "WOMEN", price: 690, mat: "linen", colors: ["oat", "sage", "black"], sizes: WOMEN, desc: "鬆緊腰頭好穿脫，亞麻涼爽，夏天在家外出都適合。" },
  { name: "針織慢跑褲", cat: "women-bottoms", type: "pants", gender: "WOMEN", price: 890, mat: "fleece", colors: ["grey", "black", "taro"], sizes: WOMEN, desc: "柔軟針織慢跑褲，束口褲管，休閒運動風。" },
  // 配件
  { name: "水洗棉老帽", cat: "acc-caps", type: "cap", gender: "UNISEX", price: 590, mat: "cotton", colors: ["oat", "black", "navy", "khaki", "sage"], sizes: FREE, desc: "水洗做舊質感，後方金屬扣可調整頭圍。", featured: true },
  { name: "燈芯絨棒球帽", cat: "acc-caps", type: "cap", gender: "UNISEX", price: 690, sale: 490, mat: "cotton", colors: ["mocha", "olive", "brick"], sizes: FREE, desc: "秋冬燈芯絨材質，溫暖復古。" },
  { name: "針織毛帽", cat: "acc-caps", type: "beanie", gender: "UNISEX", price: 490, mat: "knit", colors: ["oat", "black", "mustard", "brick"], sizes: FREE, desc: "雙層反摺針織毛帽，保暖不扎頭。" },
  { name: "帆布托特包", cat: "acc-bags", type: "tote", gender: "UNISEX", price: 790, mat: "canvas", colors: ["oat", "black", "navy"], sizes: FREE, desc: "12 安厚帆布，可放 A4 文件與 14 吋筆電，內附小口袋。", featured: true },
  { name: "尼龍斜背包", cat: "acc-bags", type: "sling", gender: "UNISEX", price: 990, mat: "nylon", colors: ["black", "olive", "grey"], sizes: FREE, desc: "輕量防潑水尼龍，多夾層收納，出門帶這個就夠。" },
  { name: "迷你帆布手提包", cat: "acc-bags", type: "tote", gender: "UNISEX", price: 490, mat: "canvas", colors: ["oat", "sage", "taro"], sizes: FREE, desc: "小巧可愛，放手機錢包剛剛好。" },
];

// ───────────── 台灣地址與門市 ─────────────

const TW_AREAS: { city: string; districts: [string, string][] }[] = [
  { city: "臺北市", districts: [["大安區", "106"], ["信義區", "110"], ["中山區", "104"], ["內湖區", "114"], ["士林區", "111"]] },
  { city: "新北市", districts: [["板橋區", "220"], ["新店區", "231"], ["永和區", "234"], ["三重區", "241"], ["淡水區", "251"]] },
  { city: "桃園市", districts: [["桃園區", "330"], ["中壢區", "320"]] },
  { city: "臺中市", districts: [["西屯區", "407"], ["北屯區", "406"], ["南屯區", "408"]] },
  { city: "臺南市", districts: [["東區", "701"], ["永康區", "710"]] },
  { city: "高雄市", districts: [["左營區", "813"], ["三民區", "807"], ["鳳山區", "830"]] },
  { city: "新竹市", districts: [["東區", "300"]] },
];
const ROADS = ["忠孝東路", "中山路", "民生東路", "復興南路", "文心路", "中正路", "建國路", "和平東路", "光復路", "博愛路"];
const STORES = ["台北101門市", "大安門市", "板橋新站門市", "中壢高鐵門市", "台中文心門市", "台南成大門市", "高雄巨蛋門市", "新竹站前門市"];

function fakeAddress() {
  const area = pick(TW_AREAS);
  const [district, zip] = pick(area.districts);
  const line = `${pick(ROADS)}${faker.number.int({ min: 1, max: 5 })}段${faker.number.int({ min: 1, max: 300 })}號${faker.number.int({ min: 2, max: 15 })}樓`;
  return { city: area.city, district, zipCode: zip, line };
}

function fakePhone() {
  return `09${faker.string.numeric(8)}`;
}

// 中文姓名（faker 的 zh_TW 名字比較少，自己組比較自然）
const SURNAMES = "陳林黃張李王吳劉蔡楊許鄭謝洪郭邱曾廖賴徐周葉蘇莊呂江何蕭羅高潘簡朱鍾彭游詹胡施沈余盧梁趙顏柯翁".split("");
const GIVEN = ["怡君", "雅婷", "家豪", "志明", "冠宇", "佳穎", "俊傑", "詩涵", "宗翰", "欣怡", "承恩", "雅琪", "柏翰", "宜蓁", "彥廷", "思妤", "建宏", "郁婷", "冠廷", "品妍", "子軒", "筱涵", "明哲", "佩珊", "宇翔"];

// ───────────── 主程式 ─────────────

async function main() {
  console.log("清空舊資料…");
  // 依照外鍵關係由下往上刪
  await prisma.returnItem.deleteMany();
  await prisma.returnRequest.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.review.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany({ where: { parentId: { not: null } } });
  await prisma.category.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.faq.deleteMany();
  await prisma.address.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();

  // 分類
  console.log("建立分類…");
  const catIdBySlug = new Map<string, string>();
  for (const [i, parent] of CATEGORIES.entries()) {
    const p = await prisma.category.create({ data: { name: parent.name, slug: parent.slug, sortOrder: i } });
    catIdBySlug.set(parent.slug, p.id);
    for (const [j, child] of parent.children.entries()) {
      const c = await prisma.category.create({ data: { name: child.name, slug: child.slug, parentId: p.id, sortOrder: j } });
      catIdBySlug.set(child.slug, c.id);
    }
  }

  // 商品
  console.log("建立商品與 SKU…");
  type VariantInfo = { id: string; sku: string; color: string; colorHex: string; size: string; productId: string; productName: string; garmentType: string; unitPrice: number };
  const allVariants: VariantInfo[] = [];
  const productIds: string[] = [];
  for (const [i, p] of PRODUCTS.entries()) {
    const code = `NW${String(i + 1).padStart(3, "0")}`;
    const slug = `${code.toLowerCase()}-${p.type}-${p.gender.toLowerCase()}`;
    const sizes = p.sizes ?? (p.gender === "WOMEN" ? WOMEN : ADULT);
    const createdAt = daysAgo(faker.number.int({ min: 10, max: 300 }));
    const product = await prisma.product.create({
      data: {
        name: p.name,
        slug,
        description: p.desc,
        material: MATERIAL[p.mat].material,
        care: MATERIAL[p.mat].care,
        garmentType: p.type,
        gender: p.gender,
        price: p.price,
        salePrice: p.sale ?? null,
        isFeatured: p.featured ?? false,
        status: "ACTIVE",
        categoryId: catIdBySlug.get(p.cat)!,
        createdAt,
        images: {
          create: p.colors.map((c, idx) => ({
            url: garmentImageUrl(p.type, COLORS[c].hex),
            alt: `${p.name} ${COLORS[c].name}`,
            color: COLORS[c].name,
            sortOrder: idx,
          })),
        },
        variants: {
          create: p.colors.flatMap((c) =>
            sizes.map((size) => ({
              sku: `${code}-${c.toUpperCase()}-${size}`,
              color: COLORS[c].name,
              colorHex: COLORS[c].hex,
              size,
              // 大部分有庫存，少數缺貨、少數只剩幾件
              stock: faker.helpers.weightedArrayElement([
                { weight: 70, value: faker.number.int({ min: 8, max: 60 }) },
                { weight: 18, value: faker.number.int({ min: 1, max: 4 }) },
                { weight: 12, value: 0 },
              ]),
            })),
          ),
        },
      },
      include: { variants: true },
    });
    productIds.push(product.id);
    for (const v of product.variants) {
      allVariants.push({ ...v, productName: p.name, garmentType: p.type, unitPrice: p.sale ?? p.price });
    }
  }
  // 一個下架商品、一個草稿，讓後台有不同狀態可看
  await prisma.product.update({ where: { id: productIds[productIds.length - 1] }, data: { status: "ARCHIVED" } });

  // 會員
  console.log("建立會員（密碼雜湊需要一點時間）…");
  const defaultHash = await hashPassword("Password123!");
  async function createUser(opts: { name: string; email: string; password?: string; role?: string; createdAt: Date; phone: string }) {
    const id = faker.string.alphanumeric(24);
    const hash = opts.password ? await hashPassword(opts.password) : defaultHash;
    await prisma.user.create({
      data: {
        id,
        name: opts.name,
        email: opts.email,
        emailVerified: true,
        role: opts.role ?? "user",
        phone: opts.phone,
        createdAt: opts.createdAt,
        accounts: { create: { id: faker.string.alphanumeric(24), accountId: id, providerId: "credential", password: hash, createdAt: opts.createdAt } },
      },
    });
    return id;
  }

  await createUser({ name: "北織管理員", email: "admin@northweave.test", password: "Admin1234!", role: "admin", createdAt: daysAgo(400), phone: "0900000001" });
  const demoId = await createUser({ name: "王小明", email: "demo@northweave.test", password: "Demo1234!", createdAt: daysAgo(200), phone: "0912345678" });

  const customerIds: string[] = [demoId];
  for (let i = 0; i < 45; i++) {
    const name = pick(SURNAMES) + pick(GIVEN);
    const email = `${faker.internet.username().toLowerCase().replace(/[^a-z0-9]/g, "")}${i}@example.com`;
    customerIds.push(await createUser({ name, email, createdAt: daysAgo(faker.number.int({ min: 5, max: 380 })), phone: fakePhone() }));
  }

  // 地址
  const userInfo = new Map<string, { name: string; phone: string; address: string }>();
  for (const uid of customerIds) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: uid } });
    const count = uid === demoId ? 2 : faker.number.int({ min: 1, max: 2 });
    for (let k = 0; k < count; k++) {
      const a = fakeAddress();
      await prisma.address.create({ data: { userId: uid, recipientName: u.name, phone: u.phone!, ...a, isDefault: k === 0 } });
      if (k === 0) userInfo.set(uid, { name: u.name, phone: u.phone!, address: `${a.zipCode} ${a.city}${a.district}${a.line}` });
    }
  }

  // 優惠券
  await prisma.coupon.createMany({
    data: [
      { code: "WELCOME100", description: "新會員首購折 NT$100（滿 NT$800）", type: "FIXED", value: 100, minSpend: 800, startsAt: daysAgo(365), endsAt: daysAgo(-365) },
      { code: "AUTUMN15", description: "秋季全館 85 折（滿 NT$1,500）", type: "PERCENT", value: 15, minSpend: 1500, startsAt: daysAgo(30), endsAt: daysAgo(-30), usageLimit: 500 },
      { code: "FREESHIP", description: "折抵運費 NT$100", type: "FIXED", value: 100, minSpend: 0, startsAt: daysAgo(10), endsAt: daysAgo(-20) },
      { code: "SUMMER20", description: "夏季特賣 8 折（已過期）", type: "PERCENT", value: 20, minSpend: 1000, startsAt: daysAgo(150), endsAt: daysAgo(90) },
    ],
  });

  // ───────────── 訂單 ─────────────
  console.log("建立訂單…");
  let orderSeq = 1;
  let rmaSeq = 1;

  type Plan = { status: OrderStatus; ageDays: number; returnPlan?: { type: ReturnType; status: ReturnStatus; reason: ReturnReason } };

  function statusForAge(age: number): OrderStatus {
    if (age > 14) return faker.helpers.weightedArrayElement([{ weight: 90, value: "COMPLETED" as const }, { weight: 10, value: "CANCELLED" as const }]);
    if (age > 6) return faker.helpers.weightedArrayElement([{ weight: 60, value: "DELIVERED" as const }, { weight: 30, value: "COMPLETED" as const }, { weight: 10, value: "CANCELLED" as const }]);
    if (age > 2) return pick(["SHIPPED", "DELIVERED", "PROCESSING"] as const);
    return pick(["PENDING_PAYMENT", "PAID", "PROCESSING"] as const);
  }

  async function createOrder(userId: string, plan: Plan) {
    const info = userInfo.get(userId)!;
    // 往前扣幾個小時，避免「今天」的訂單時間跑到未來
    const placedAt = addHours(daysAgo(plan.ageDays), -faker.number.int({ min: 1, max: 12 }));
    const shippingMethod: ShippingMethod = pick(["HOME", "CVS"] as const);
    const paymentMethod: PaymentMethod = plan.status === "PENDING_PAYMENT" ? "ATM" : pick(["CREDIT_CARD", "CREDIT_CARD", "LINE_PAY", "ATM", "COD"] as const);

    const lines = faker.helpers.arrayElements(allVariants.filter((v) => v.size !== "F" || faker.datatype.boolean(0.3)), faker.number.int({ min: 1, max: 3 }));
    const items = lines.map((v) => ({ v, quantity: faker.helpers.weightedArrayElement([{ weight: 80, value: 1 }, { weight: 20, value: 2 }]) }));
    const subtotal = items.reduce((s, it) => s + it.v.unitPrice * it.quantity, 0);
    const coupon = subtotal >= 1500 && faker.datatype.boolean(0.15) ? { code: "AUTUMN15", discount: Math.round(subtotal * 0.15) } : subtotal >= 800 && faker.datatype.boolean(0.1) ? { code: "WELCOME100", discount: 100 } : null;
    const discount = coupon?.discount ?? 0;
    const shippingFee = shippingFeeFor(shippingMethod, subtotal - discount);
    const total = subtotal - discount + shippingFee;

    // 依狀態推算各時間點，並寫入狀態歷程
    const history: { status: OrderStatus; createdAt: Date; note?: string }[] = [{ status: "PENDING_PAYMENT", createdAt: placedAt, note: "訂單成立" }];
    const isCod = paymentMethod === "COD";
    let paidAt: Date | null = null, shippedAt: Date | null = null, deliveredAt: Date | null = null, cancelledAt: Date | null = null;
    const flow: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "COMPLETED"];
    if (plan.status === "CANCELLED") {
      cancelledAt = addHours(placedAt, faker.number.int({ min: 1, max: 30 }));
      history.push({ status: "CANCELLED", createdAt: cancelledAt, note: pick(["顧客取消訂單", "逾期未付款，系統自動取消", "商品缺貨，已通知顧客"]) });
    } else {
      const target = flow.indexOf(plan.status);
      let t = placedAt;
      for (let k = 0; k <= target; k++) {
        const s = flow[k];
        t = addHours(t, s === "PAID" ? 0.2 : s === "PROCESSING" ? 12 : s === "SHIPPED" ? 20 : s === "DELIVERED" ? 30 : (RETURN_WINDOW_DAYS + 1) * 24);
        if (t > NOW) t = new Date(Math.min(NOW.getTime() - 60_000, placedAt.getTime() + (k + 1) * 600_000)); // 不讓時間跑到未來
        if (s === "PAID") { if (isCod) continue; paidAt = t; }
        if (s === "SHIPPED") shippedAt = t;
        if (s === "DELIVERED") { deliveredAt = t; if (isCod) paidAt = t; }
        history.push({ status: s, createdAt: t, note: s === "SHIPPED" ? `已交由${SHIPPING.carriers[shippingMethod]}配送` : s === "COMPLETED" ? "鑑賞期結束，訂單完成" : undefined });
      }
    }
    const paymentStatus = paidAt ? "PAID" : "UNPAID";
    const taipeiDate = placedAt.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }).slice(2).replace(/-/g, "");
    const orderNumber = `NW${taipeiDate}${String(orderSeq++).padStart(4, "0")}`;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId,
        status: plan.status,
        paymentMethod,
        paymentStatus,
        shippingMethod,
        recipientName: info.name,
        recipientPhone: info.phone,
        shippingAddress: shippingMethod === "HOME" ? info.address : `7-ELEVEN ${pick(STORES)}`,
        subtotal, discount, shippingFee, total,
        couponCode: coupon?.code,
        carrier: shippedAt ? SHIPPING.carriers[shippingMethod] : null,
        trackingNumber: shippedAt ? faker.string.numeric(12) : null,
        placedAt, paidAt, shippedAt, deliveredAt, cancelledAt,
        items: {
          create: items.map(({ v, quantity }) => ({
            variantId: v.id, productName: v.productName, sku: v.sku, color: v.color, size: v.size,
            unitPrice: v.unitPrice, quantity, imageUrl: garmentImageUrl(v.garmentType, v.colorHex),
          })),
        },
        history: { create: history },
      },
      include: { items: true },
    });

    // 退換貨
    if (plan.returnPlan && deliveredAt) {
      const rp = plan.returnPlan;
      const item = order.items[0];
      let exchangeVariantId: string | null = null;
      if (rp.type === "EXCHANGE") {
        const alt = allVariants.find((v) => v.sku.split("-")[0] === item.sku.split("-")[0] && v.color === item.color && v.size !== item.size);
        exchangeVariantId = alt?.id ?? null;
      }
      const createdAt = addHours(deliveredAt, faker.number.int({ min: 6, max: 24 * (RETURN_WINDOW_DAYS - 1) }));
      const refund = rp.type === "RETURN" && rp.status === "REFUNDED" ? item.unitPrice * item.quantity : null;
      await prisma.returnRequest.create({
        data: {
          rmaNumber: `RMA${String(rmaSeq++).padStart(6, "0")}`,
          orderId: order.id, userId, type: rp.type, status: rp.status, reason: rp.reason,
          description: pick(["穿起來比預期小一號", "版型比較寬鬆，想換小一號", "收到時袖口有脫線", "顏色和照片差有點多", "收到的尺寸跟訂的不一樣", "家人送了一件一樣的"]),
          refundAmount: refund,
          adminNote: rp.status === "REJECTED" ? "商品已有穿著痕跡且吊牌已剪，不符退貨條件" : null,
          createdAt, updatedAt: addHours(createdAt, 48),
          items: { create: [{ orderItemId: item.id, quantity: item.quantity, exchangeVariantId }] },
        },
      });
      if (refund) await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: refund >= order.total ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    }
    return order;
  }

  // Demo 帳號：精心安排各種狀態，方便展示與測試客服 BOT
  await createOrder(demoId, { status: "COMPLETED", ageDays: 60 });
  await createOrder(demoId, { status: "COMPLETED", ageDays: 35, returnPlan: { type: "RETURN", status: "REFUNDED", reason: "SIZE_TOO_SMALL" } });
  await createOrder(demoId, { status: "DELIVERED", ageDays: 9, returnPlan: { type: "EXCHANGE", status: "APPROVED", reason: "SIZE_TOO_LARGE" } });
  await createOrder(demoId, { status: "DELIVERED", ageDays: 4 }); // 還在鑑賞期內，可以申請退換貨
  await createOrder(demoId, { status: "SHIPPED", ageDays: 2 });
  await createOrder(demoId, { status: "PENDING_PAYMENT", ageDays: 0 });

  // 其他會員：隨機訂單
  const RETURN_COMBOS: { type: ReturnType; status: ReturnStatus; reason: ReturnReason }[] = [
    { type: "RETURN", status: "REFUNDED", reason: "CHANGED_MIND" },
    { type: "RETURN", status: "REQUESTED", reason: "NOT_AS_DESCRIBED" },
    { type: "RETURN", status: "RECEIVED", reason: "DEFECTIVE" },
    { type: "RETURN", status: "REJECTED", reason: "CHANGED_MIND" },
    { type: "EXCHANGE", status: "EXCHANGED", reason: "SIZE_TOO_SMALL" },
    { type: "EXCHANGE", status: "REQUESTED", reason: "SIZE_TOO_LARGE" },
    { type: "EXCHANGE", status: "APPROVED", reason: "WRONG_ITEM" },
  ];
  for (const uid of customerIds.slice(1)) {
    const n = faker.helpers.weightedArrayElement([{ weight: 15, value: 0 }, { weight: 35, value: faker.number.int({ min: 1, max: 2 }) }, { weight: 50, value: faker.number.int({ min: 3, max: 7 }) }]);
    for (let k = 0; k < n; k++) {
      const age = faker.number.int({ min: 0, max: 180 });
      const status = statusForAge(age);
      const canReturn = status === "DELIVERED" || status === "COMPLETED";
      await createOrder(uid, { status, ageDays: age, returnPlan: canReturn && faker.datatype.boolean(0.12) ? pick(RETURN_COMBOS) : undefined });
    }
  }

  // 評論：只有買過且已送達的人才能評論
  console.log("建立評論…");
  const delivered = await prisma.orderItem.findMany({ where: { order: { status: { in: ["DELIVERED", "COMPLETED"] } }, variant: { isNot: null } }, include: { order: true, variant: true } });
  const seen = new Set<string>();
  const REVIEW_TEXT: Record<1 | 2 | 3 | 4 | 5, [string, string][]> = {
    5: [["超級喜歡", "質感很好，洗過也沒有變形，已經回購第二件。"], ["版型很好看", "穿起來很有型，朋友都問哪裡買的。"], ["CP 值很高", "這個價位能有這種品質真的很難得。"]],
    4: [["整體不錯", "布料舒服，只是顏色比照片稍微深一點。"], ["推薦", "穿起來很舒服，出貨速度也快。"]],
    3: [["還可以", "品質普通，以這個價格來說可以接受。"], ["尺寸偏大", "建議買小一號，其他都還不錯。"]],
    2: [["有點失望", "洗一次就有點起毛球了。"]],
    1: [["不推薦", "收到有線頭，客服處理很久。"]],
  };
  for (const it of delivered) {
    const key = `${it.order.userId}-${it.variant!.productId}`;
    if (seen.has(key) || !faker.datatype.boolean(0.45)) continue;
    seen.add(key);
    const rating = faker.helpers.weightedArrayElement([{ weight: 50, value: 5 }, { weight: 28, value: 4 }, { weight: 12, value: 3 }, { weight: 6, value: 2 }, { weight: 4, value: 1 }]) as 1 | 2 | 3 | 4 | 5;
    const [title, body] = pick(REVIEW_TEXT[rating]);
    await prisma.review.create({
      data: {
        productId: it.variant!.productId, userId: it.order.userId, rating, title, body,
        fit: pick(["SMALL", "TRUE", "TRUE", "TRUE", "LARGE"]),
        createdAt: addHours(it.order.deliveredAt!, faker.number.int({ min: 24, max: 24 * 20 })),
      },
    });
  }

  // 購物車與收藏（demo 帳號放幾件，打開就能看到）
  const demoCart = faker.helpers.arrayElements(allVariants, 2);
  for (const v of demoCart) await prisma.cartItem.create({ data: { userId: demoId, variantId: v.id, quantity: 1 } });
  for (const pid of faker.helpers.arrayElements(productIds.slice(0, -1), 4)) await prisma.wishlistItem.create({ data: { userId: demoId, productId: pid } });

  // FAQ
  console.log("建立 FAQ…");
  const FAQS: [string, string, string][] = [
    ["訂單", "如何查詢我的訂單狀態？", "登入後進入「會員中心 → 我的訂單」即可查看每筆訂單的狀態與物流進度。出貨後會提供物流單號，可到物流商網站追蹤。"],
    ["訂單", "下單後可以修改或取消訂單嗎？", "訂單在「待付款」或「已付款」狀態時，可以在訂單頁面自行取消。進入「備貨中」後就無法取消，請待收到商品後申請退貨。訂單內容（商品、尺寸）無法直接修改，請取消後重新下單。"],
    ["付款", "有哪些付款方式？", "提供信用卡（VISA / Master / JCB）、LINE Pay、ATM 轉帳與貨到付款。ATM 轉帳請於下單後 3 天內完成付款，逾期訂單將自動取消。"],
    ["付款", "可以開立發票嗎？", "所有訂單皆開立電子發票，會寄送到會員 Email。如需統一編號，請在結帳備註欄填寫。"],
    ["運送", "運費怎麼算？多久會到？", `單筆訂單折扣後滿 NT$${SHIPPING.freeThreshold.toLocaleString()} 免運。未滿額時，宅配運費 NT$${SHIPPING.fee.HOME}、超商取貨 NT$${SHIPPING.fee.CVS}。付款完成後 1–2 個工作天出貨，宅配約 1–2 天送達，超商取貨約 2–3 天到店。`],
    ["運送", "有寄送海外嗎？", "目前僅配送台灣本島，離島與海外暫不提供配送服務。"],
    ["運送", "超商取貨沒有去拿會怎樣？", "包裹到店後會保留 7 天，逾期未取件將退回倉庫，訂單會被取消並退款（如已付款），但運費不予退還。多次未取件可能限制使用超商取貨。"],
    ["退換貨", "退換貨的規定是什麼？", `收到商品隔天起 ${RETURN_WINDOW_DAYS} 天內（鑑賞期）可申請退貨或換貨。商品需保持全新、吊牌未剪、未下水洗滌，並附上完整包裝。商品若有穿著痕跡、異味或吊牌已剪，恕不接受退貨（瑕疵品除外）。`],
    ["退換貨", "如何申請退貨或換貨？", "登入後到「我的訂單」選擇要退換的訂單，點「申請退換貨」，勾選商品、選擇原因，換貨可直接選擇要換的尺寸或顏色。送出後我們會在 1–2 個工作天內審核，核准後會提供寄回方式。"],
    ["退換貨", "退款多久會收到？", "收到退回商品並檢查無誤後 3–5 個工作天內退款。信用卡退回原卡（實際入帳依發卡銀行約 7–14 天）、LINE Pay 退回 LINE Pay 帳戶，ATM 與貨到付款將匯款至您提供的帳戶。"],
    ["退換貨", "換貨要付運費嗎？", "因尺寸不合換貨，第一次換貨來回運費由我們吸收。若是商品瑕疵或寄錯，所有運費都由我們負擔。"],
    ["商品", "尺寸怎麼選？", "每件商品頁都有尺寸表與評論的「尺寸回饋」。如果介於兩個尺寸之間，寬鬆版型建議選小一號，合身版型建議選大一號。"],
    ["商品", "商品缺貨會補貨嗎？", "熱門商品通常 2–4 週內補貨。可以先把商品加入收藏，補貨後在收藏清單就能看到。"],
    ["會員", "忘記密碼怎麼辦？", "請在登入頁點「忘記密碼」，或聯絡客服協助重設。"],
    ["會員", "如何修改會員資料或收件地址？", "登入後到「會員中心 → 個人資料 / 收件地址」即可修改，可以儲存多組地址並設定預設地址。"],
  ];
  await prisma.faq.createMany({ data: FAQS.map(([category, question, answer], i) => ({ category, question, answer, sortOrder: i })) });

  const counts = {
    users: await prisma.user.count(), products: await prisma.product.count(), variants: await prisma.productVariant.count(),
    orders: await prisma.order.count(), returns: await prisma.returnRequest.count(), reviews: await prisma.review.count(), faqs: await prisma.faq.count(),
  };
  console.log("完成！", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
