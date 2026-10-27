/* taco 試算表：不碰畫面的部分（記帳彙總、股票費用與持股、清單天數、資料分析、備份碼），網頁和測試共用。
   算法和 Excel 版「taco通用試算表.xlsx」一樣。 */
"use strict";

const DEFAULTS = {
  income: ["薪資", "獎金", "投資收入", "兼職", "其他收入"],
  expense: ["餐飲", "交通", "居住", "水電瓦斯", "電信網路", "日用品", "娛樂", "學習", "醫療", "保險", "服飾", "其他支出"],
  pay: ["現金", "信用卡", "金融卡", "行動支付", "轉帳"],
  todoCats: ["工作", "學習", "家裡", "採購", "其他"],
  // 台股：手續費上限 0.1425%（無條件捨去、有最低手續費）；證交稅賣出才收：股票 0.3%、ETF 0.1%、現股當沖 0.15%（減半到 2027/12/31）
  fees: { rate: 0.001425, disc: 1, min: 20, taxStock: 0.003, taxEtf: 0.001, taxDay: 0.0015 },
};
const TODO_STATES = ["待辦", "進行中", "完成", "暫停"];
const PRIORITIES = ["高", "中", "低"];
const clone = (o) => JSON.parse(JSON.stringify(o));

function newData() {
  return { app: "taco-sheets", v: 1, budget: [], trades: [], prices: {}, todos: [], table: "", settings: clone(DEFAULTS), seq: 1 };
}
/* 舊資料或備份碼缺欄位時補齊 */
function normalize(d) {
  const base = newData();
  if (!d || typeof d !== "object") return base;
  const out = Object.assign(base, d);
  out.settings = Object.assign(clone(DEFAULTS), d.settings || {});
  out.settings.fees = Object.assign(clone(DEFAULTS.fees), (d.settings && d.settings.fees) || {});
  for (const k of ["income", "expense", "pay", "todoCats"])
    if (!Array.isArray(out.settings[k])) out.settings[k] = clone(DEFAULTS[k]);
  // 費率：每一項都要是 0 以上的數字，不然用預設（備份碼可能被改過）
  for (const k of Object.keys(DEFAULTS.fees)) { const v = Number(out.settings.fees[k]); out.settings.fees[k] = isFinite(v) && v >= 0 ? v : DEFAULTS.fees[k]; }
  for (const k of ["income", "expense", "pay", "todoCats"]) {
    out.settings[k] = out.settings[k].filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim().slice(0, 40));
    if (!out.settings[k].length) out.settings[k] = clone(DEFAULTS[k]);
  }
  // 紀錄：只留物件；id 一律是正整數、不重複，seq 接在最大 id 後面（避免改過的備份碼塞奇怪的 id）
  let maxId = 0;
  const used = new Set();
  for (const k of ["budget", "trades", "todos"]) {
    out[k] = (Array.isArray(out[k]) ? out[k] : []).filter((x) => x && typeof x === "object" && !Array.isArray(x)).map((x) => Object.assign({}, x));
    for (const x of out[k]) { const id = Number(x.id); x.id = Number.isInteger(id) && id > 0 && !used.has(id) ? id : 0; if (x.id) { used.add(x.id); maxId = Math.max(maxId, x.id); } }
  }
  for (const k of ["budget", "trades", "todos"]) for (const x of out[k]) if (!x.id) { x.id = ++maxId; used.add(x.id); }
  out.seq = Math.max(Number(out.seq) || 1, maxId + 1);
  const prices = {};
  if (out.prices && typeof out.prices === "object") for (const [c, v] of Object.entries(out.prices)) if (Number(v) > 0) prices[c] = Number(v);
  out.prices = prices;
  if (typeof out.table !== "string") out.table = "";
  return out;
}

/* ---------- 日期（一律用 "YYYY-MM-DD" 字串，避免時區問題） ---------- */
const pad = (n) => String(n).padStart(2, "0");
function todayStr(now = new Date()) { return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; }
function isDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")); }
function dayNum(s) { return Math.round(Date.parse(s + "T00:00:00Z") / 86400000); }
const num = (v) => (typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "")));
const money = (v) => { const n = num(v); return isFinite(n) ? n : 0; };

/* ---------- 記帳 ---------- */
/* 一年 12 個月的收入、支出、結餘、累計結餘 */
function budgetMonthly(entries, year) {
  const rows = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, income: 0, expense: 0, net: 0, cum: 0 }));
  for (const e of entries) {
    if (!isDate(e.date) || +e.date.slice(0, 4) !== +year) continue;
    const r = rows[+e.date.slice(5, 7) - 1];
    if (e.kind === "收入") r.income += money(e.amount); else if (e.kind === "支出") r.expense += money(e.amount);
  }
  let cum = 0;
  for (const r of rows) { r.net = r.income - r.expense; cum += r.net; r.cum = cum; }
  const total = rows.reduce((t, r) => ({ income: t.income + r.income, expense: t.expense + r.expense, net: t.net + r.net }), { income: 0, expense: 0, net: 0 });
  return { rows, total };
}
/* 某年某月（month=0 代表全年）的支出類別；不在類別清單裡、或沒填類別的算「未分類／其他」 */
function budgetByCategory(entries, year, month, cats) {
  const map = new Map(cats.map((c) => [c, 0]));
  let other = 0, total = 0;
  for (const e of entries) {
    if (e.kind !== "支出" || !isDate(e.date) || +e.date.slice(0, 4) !== +year) continue;
    if (month && +e.date.slice(5, 7) !== +month) continue;
    const a = money(e.amount); total += a;
    if (map.has(e.cat)) map.set(e.cat, map.get(e.cat) + a); else other += a;
  }
  const rows = [...map].map(([cat, amount]) => ({ cat, amount, share: total ? amount / total : 0 }));
  if (other) rows.push({ cat: "未分類／其他", amount: other, share: total ? other / total : 0, other: true });
  return { rows, total };
}

/* ---------- 股票 ---------- */
const floor = (v) => Math.floor(v + 1e-9);   // 0.1425% 這種費率乘出來會有 70.99999999，先補一點再捨去
/* 一筆交易的成交金額、手續費、交易稅、收付金額（買進是負數） */
function tradeCalc(t, fees) {
  const qty = num(t.qty), price = num(t.price);
  if (!(qty > 0) || !(price > 0) || (t.side !== "買進" && t.side !== "賣出")) return null;
  const amount = qty * price;
  const fee = Math.max(fees.min, floor(amount * fees.rate * fees.disc));
  const taxRate = t.type === "ETF" ? fees.taxEtf : t.type === "當沖" ? fees.taxDay : fees.taxStock;
  const tax = t.side === "賣出" ? floor(amount * taxRate) : 0;
  const net = t.side === "買進" ? -(amount + fee) : amount - fee - tax;
  return { amount, fee, tax, net };
}
/* 持股彙總（平均成本法）：代號照字面比對，006208 和 6208 是不同檔 */
function holdings(trades, fees, prices = {}) {
  const map = new Map();
  for (const t of trades) {
    const c = tradeCalc(t, fees); if (!c) continue;
    const code = String(t.code || "").trim(); if (!code) continue;
    if (!map.has(code)) map.set(code, { code, name: t.name || "", buyQty: 0, buyCost: 0, sellQty: 0, sellNet: 0 });
    const h = map.get(code); if (!h.name && t.name) h.name = t.name;
    h.type = t.type;   // 預估賣出稅率用最後一筆的類型（股票／ETF／當沖）
    if (t.side === "買進") { h.buyQty += num(t.qty); h.buyCost += -c.net; } else { h.sellQty += num(t.qty); h.sellNet += c.net; }
  }
  return [...map.values()].map((h) => {
    const avg = h.buyQty ? h.buyCost / h.buyQty : 0;
    const qty = h.buyQty - h.sellQty;
    const realized = h.sellNet - avg * h.sellQty;
    const cost = avg * Math.max(qty, 0);
    const p = num(prices[h.code]);
    const mv = p > 0 ? p * Math.max(qty, 0) : null;
    const unreal = mv === null ? null : mv - cost;
    const ret = unreal === null || !cost ? null : unreal / cost;
    // 假設現在就全部賣掉：再扣掉賣出的手續費和證交稅（跟多數券商 App 的「預估損益」同算法）
    const est = mv !== null && qty > 0 ? tradeCalc({ side: "賣出", type: h.type, qty, price: p }, fees) : null;
    const sellCost = est ? est.fee + est.tax : null;
    const unrealNet = sellCost === null ? null : mv - sellCost - cost;
    const retNet = unrealNet === null || !cost ? null : unrealNet / cost;
    const warn = qty < 0 ? "賣出比買進多" : "";
    return Object.assign(h, { avg, qty, realized, cost, price: p > 0 ? p : null, mv, unreal, ret, sellCost, unrealNet, retNet, warn });
  });
}

/* ---------- 萬用清單 ---------- */
/* 到期還剩幾天（負數＝逾期）；沒到期日、日期錯、已完成回 null */
function daysLeft(item, today) {
  if (!item || item.state === "完成" || !isDate(item.due) || !isDate(today)) return null;
  return dayNum(item.due) - dayNum(today);
}
function todoStats(todos, today) {
  const s = { todo: 0, doing: 0, done: 0, paused: 0, open: 0, overdue: 0, soon: 0 };
  for (const t of todos) {
    if (t.state === "完成") s.done++; else { s.open++; if (t.state === "進行中") s.doing++; else if (t.state === "暫停") s.paused++; else s.todo++; }
    const d = daysLeft(t, today);
    if (d !== null) { if (d < 0) s.overdue++; else if (d <= 3) s.soon++; }
  }
  return s;
}

/* ---------- 資料分析 ---------- */
/* 貼上的表格（Excel 複製來的是 Tab 分隔，CSV 是逗號）；第一列是欄名 */
function parseTable(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return { headers: [], rows: [] };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : /\s{2,}|\s/.test(lines[0].trim()) ? /\s+/ : "\t";
  const csv = (l) => {   // 逗號分隔，支援 "台北, 大安"、"1,234" 這種有引號的欄位
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur); return out;
  };
  const split = (l) => (sep instanceof RegExp ? l.trim().split(sep) : sep === "," ? csv(l) : l.split(sep)).map((c) => c.trim());
  const headers = split(lines[0]).map((h, i) => h || `欄${i + 1}`);
  const rows = lines.slice(1).map(split).map((r) => headers.map((_, i) => (r[i] === undefined ? "" : r[i])));
  return { headers, rows };
}
const NUM_RE = /^[-+]?(\d{1,3}(,\d{3})+|\d*)(\.\d+)?([eE][-+]?\d+)?$/;
const isNum = (s) => { const t = String(s).trim(); return t !== "" && t !== "-" && t !== "+" && t !== "." && NUM_RE.test(t) && isFinite(num(t)); };
/* 一半以上是數字的欄才算數字欄 */
function numericCols(tbl) {
  return tbl.headers.map((_, i) => i).filter((i) => {
    const vals = tbl.rows.map((r) => r[i]).filter((v) => v !== "");
    return vals.length > 0 && vals.filter(isNum).length / vals.length >= 0.5;
  });
}
const colNums = (tbl, i) => tbl.rows.map((r) => r[i]).filter(isNum).map(num);
/* 四分位數：和 Excel QUARTILE、pandas quantile 一樣的線性內插 */
function quantile(sorted, p) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function describe(nums) {
  const n = nums.length;
  if (!n) return { count: 0 };
  const s = nums.slice().sort((a, b) => a - b), sum = nums.reduce((a, b) => a + b, 0), mean = sum / n;
  const v = n > 1 ? nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : null;
  // 眾數：出現最多次、而且至少 2 次；多個時取最先出現的（和 Excel MODE 一樣）
  const cnt = new Map(); for (const x of nums) cnt.set(x, (cnt.get(x) || 0) + 1);
  const best = Math.max(...cnt.values()), mode = best >= 2 ? nums.find((x) => cnt.get(x) === best) : null;
  return { count: n, mean, median: quantile(s, 0.5), mode, std: v === null ? null : Math.sqrt(v), var: v,
           min: s[0], q1: quantile(s, 0.25), q3: quantile(s, 0.75), max: s[n - 1], range: s[n - 1] - s[0], sum };
}
/* 相關係數：只用兩欄都有數字的列 */
function correl(tbl, i, j) {
  const pairs = tbl.rows.filter((r) => isNum(r[i]) && isNum(r[j])).map((r) => [num(r[i]), num(r[j])]);
  const n = pairs.length; if (n < 2) return null;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n, my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
/* 次數分配：最小到最大切成 bins 組，最後一組包含最大值 */
function histogram(nums, bins = 10) {
  if (!nums.length) return [];
  const min = Math.min(...nums), max = Math.max(...nums), w = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, k) => ({ lo: min + k * w, hi: min + (k + 1) * w, count: 0 }));
  for (const x of nums) { let k = w ? Math.floor((x - min) / w) : bins - 1; if (k >= bins) k = bins - 1; out[k].count++; }
  return out;
}
/* 分組彙總（像 pandas groupby）：組別照第一次出現的順序 */
function groupBy(tbl, gi, vi) {
  const map = new Map();
  for (const r of tbl.rows) {
    const g = r[gi] === "" ? "（空白）" : r[gi];
    if (!map.has(g)) map.set(g, []);
    if (isNum(r[vi])) map.get(g).push(num(r[vi]));
  }
  return [...map].map(([group, xs]) => ({ group, count: xs.length, mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null,
    min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null, sum: xs.reduce((a, b) => a + b, 0) }));
}

/* ---------- 備份碼：把全部資料搬到另一台裝置 ---------- */
function exportCode(d) { return JSON.stringify(Object.assign({}, d, { app: "taco-sheets" })); }
function importCode(text) {
  let d; try { d = JSON.parse(String(text || "").trim()); } catch (e) { return null; }
  if (!d || d.app !== "taco-sheets") return null;
  return normalize(d);
}

if (typeof module !== "undefined") module.exports = { DEFAULTS, TODO_STATES, PRIORITIES, newData, normalize, todayStr, isDate, budgetMonthly, budgetByCategory,
  tradeCalc, holdings, daysLeft, todoStats, parseTable, numericCols, colNums, quantile, describe, correl, histogram, groupBy, exportCode, importCode };
