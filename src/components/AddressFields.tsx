export const TW_CITIES = [
  "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", "基隆市", "新竹市", "嘉義市",
  "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣",
];

// 地址欄位：會員中心新增地址、結帳頁新地址共用
export function AddressFields({ defaultName = "", defaultPhone = "", prefix = "" }: { defaultName?: string; defaultPhone?: string; prefix?: string }) {
  const n = (k: string) => `${prefix}${k}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor={n("recipientName")}>收件人</label>
        <input id={n("recipientName")} name={n("recipientName")} defaultValue={defaultName} className="input" required />
      </div>
      <div>
        <label className="label" htmlFor={n("phone")}>手機</label>
        <input id={n("phone")} name={n("phone")} defaultValue={defaultPhone} className="input" inputMode="numeric" placeholder="0912345678" required />
      </div>
      <div>
        <label className="label" htmlFor={n("city")}>縣市</label>
        <select id={n("city")} name={n("city")} className="input" required defaultValue="">
          <option value="" disabled>請選擇</option>
          {TW_CITIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-[1fr_90px] gap-2">
        <div>
          <label className="label" htmlFor={n("district")}>鄉鎮市區</label>
          <input id={n("district")} name={n("district")} className="input" placeholder="大安區" required />
        </div>
        <div>
          <label className="label" htmlFor={n("zipCode")}>郵遞區號</label>
          <input id={n("zipCode")} name={n("zipCode")} className="input" inputMode="numeric" placeholder="106" required />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={n("line")}>詳細地址</label>
        <input id={n("line")} name={n("line")} className="input" placeholder="復興南路一段 100 號 5 樓" required />
      </div>
    </div>
  );
}
