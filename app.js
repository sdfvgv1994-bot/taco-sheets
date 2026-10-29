/* taco 試算表：畫面、存檔（這台裝置的瀏覽器）、安裝到桌面。規則和計算在 core.js。 */
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KEY = "taco-sheets-v1";
const SAMPLE = "班級\t數學\t英文\t讀書時數\t睡眠時數\t手機時數\nA\t74\t71\t2.3\t8.2\t3.6\nB\t53\t54\t0.8\t5.7\t5.7\nC\t61\t33\t1.5\t8.2\t5.1\nA\t75\t61\t3.0\t6.7\t2.3\nB\t78\t83\t2.1\t7.0\t4.4\nC\t75\t77\t3.1\t6.2\t2.9\nA\t95\t60\t4.3\t6.5\t1.3\nB\t46\t70\t1.0\t6.8\t5.4\nC\t71\t58\t3.5\t6.0\t3.0\nA\t61\t58\t0.8\t8.0\t4.8\nB\t99\t87\t4.2\t7.7\t2.6\nC\t70\t68\t2.3\t8.2\t3.6\nA\t69\t62\t3.1\t6.6\t3.0\nB\t70\t76\t3.3\t7.1\t3.5\nC\t83\t68\t3.9\t7.6\t2.2\nA\t67\t40\t1.7\t6.5\t4.6\nB\t58\t85\t0.9\t8.4\t4.7\nC\t55\t69\t0.9\t6.6\t5.4\nA\t91\t85\t3.3\t6.4\t3.3\nB\t57\t59\t2.0\t8.2\t4.1\nC\t97\t53\t4.1\t6.5\t1.4\nA\t96\t77\t4.5\t6.8\t1.5\nB\t53\t66\t2.5\t8.5\t2.7\nC\t84\t74\t3.6\t8.3\t2.9\nA\t83\t79\t3.6\t6.3\t1.6\nB\t85\t66\t3.7\t6.3\t3.2\nC\t88\t75\t4.2\t7.0\t2.6\nA\t82\t66\t3.1\t6.3\t3.5\nB\t67\t58\t2.4\t7.6\t4.4\nC\t73\t76\t3.9\t5.6\t1.4";

/* ---------- 存檔 ---------- */
let D = load();
function load() {
  try { const s = localStorage.getItem(KEY); if (s) return normalize(JSON.parse(s)); } catch (e) { /* 沒存檔或瀏覽器不給存 */ }
  return newData();
}
let saveOk = true;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(D)); saveOk = true; }
  catch (e) { if (saveOk) toast("這個瀏覽器不讓網站存資料（無痕模式？）：關掉網頁資料就不見了"); saveOk = false; }
}
const nextId = () => D.seq++;

/* ---------- 小工具 ---------- */
const fmt = (n) => (n === null || n === undefined || !isFinite(n) ? "—" : Math.round(n).toLocaleString("zh-TW"));
const fmt2 = (n, d = 2) => (n === null || n === undefined || !isFinite(n) ? "—" : n.toLocaleString("zh-TW", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (n, d = 1) => (n === null || n === undefined || !isFinite(n) ? "—" : (n * 100).toFixed(d) + "%");
const sign = (n) => (n < 0 ? "neg" : n > 0 ? "pos" : "");
const tw = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");   // 股票：台股習慣漲紅跌綠
const opts = (list, sel) => list.map((v) => `<option${v === sel ? " selected" : ""}>${esc(v)}</option>`).join("");
const today = () => todayStr();
let toastT = 0;
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600); }
const now = new Date();
const ui = { view: "home", year: now.getFullYear(), month: now.getMonth() + 1, editB: null, editT: null, editD: null, kind: "支出", side: "買進",
  todoShow: "open", todoCat: "", hist: null, gcol: null, vcol: null };

/* ---------- 圖表（SVG） ---------- */
/* 刻度：每格是 1、2、5×10ⁿ，大約 4 格；最小 1（次數、金額不出現小數刻度） */
function niceStep(max) { const raw = Math.max(max / 4, 1), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
const short = (v) => (v >= 10000 ? +(v / 10000).toFixed(1) + "萬" : Math.round(v).toLocaleString("zh-TW"));
/* 長條圖：series=[{name,color,values}]，labels 每組的名字 */
function barChart(labels, series, opt = {}) {
  const W = 380, H = opt.h || 200, L = 40, R = 4, T = 8, B = 22, n = labels.length, k = series.length;
  const top = Math.max(0, ...series.flatMap((s) => s.values));
  if (!top) return '<p class="empty">還沒有資料可以畫圖</p>';
  const step = niceStep(top), ticks = Math.ceil(top / step), max = step * ticks;
  const gw = (W - L - R) / n, bw = Math.max(3, Math.min(22, (gw - 6) / k - 2));
  let h = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.title || "長條圖")}">`;
  for (let i = 0; i <= ticks; i++) {
    const y = T + (H - T - B) * (1 - i / ticks);
    h += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke-width="1"/><text x="${L - 5}" y="${y + 4}" text-anchor="end">${short(step * i)}</text>`;
  }
  labels.forEach((lab, i) => {
    const x0 = L + gw * i + (gw - (bw + 2) * k + 2) / 2;
    series.forEach((s, j) => {
      const v = s.values[i] || 0, bh = (H - T - B) * v / max, x = x0 + j * (bw + 2), y = H - B - bh;
      if (v > 0) h += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${s.color}"><title>${esc(lab)} ${esc(s.name)}：${Math.round(v).toLocaleString("zh-TW")}</title></rect>`;
    });
    h += `<text x="${L + gw * i + gw / 2}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`;
  });
  return h + "</svg>";
}
const legend = (items) => `<div class="legend">${items.map(([n, c]) => `<span><i style="background:${c}"></i>${esc(n)}</span>`).join("")}</div>`;

/* ======================= 首頁 ======================= */
function vHome() {
  const t = today(), y = +t.slice(0, 4), m = +t.slice(5, 7);
  const mon = budgetMonthly(D.budget, y).rows[m - 1];
  const H = holdings(D.trades, D.settings.fees, D.prices, D.divs);
  const real = H.reduce((a, h) => a + h.realized, 0);
  const s = todoStats(D.todos, t);
  const tbl = parseTable(D.table), nc = numericCols(tbl);
  const tile = (v, ic, name, desc, k) => `<a class="tile" href="#${v}"><span class="ic">${ic}</span><b>${name}</b><p>${desc}</p><div class="kpi">${k.map(([l, val, cls]) => `<div><small>${l}</small><strong class="${cls || ""}">${val}</strong></div>`).join("")}</div></a>`;
  return `<h2>要用哪一種？</h2>
  <div class="tiles">
    ${tile("budget", "📒", "記帳／每月收支", "一筆一筆記，自動出每月收支、結餘、支出類別", [[`${m} 月收入`, fmt(mon.income)], [`${m} 月支出`, fmt(mon.expense)]])}
    ${tile("stock", "📈", "股票交易紀錄", "自動算手續費、證交稅；持股、平均成本、損益", [["交易筆數", D.trades.length], ["已實現損益", fmt(real), sign(real)]])}
    ${tile("todo", "✅", "萬用清單／待辦", "待辦、購物、追蹤進度；到期變色、完成劃掉", [["未完成", s.open], ["逾期", s.overdue, s.overdue ? "neg" : ""]])}
    ${tile("analysis", "📊", "資料分析練習", "貼上資料自動出統計、相關、直方圖、分組", [["資料列數", tbl.rows.length], ["數字欄", nc.length]])}
  </div>
  <div class="card" style="margin-top:14px"><h3>小提醒</h3>
    <p class="note" style="margin:0">資料只存在<b>這台裝置的瀏覽器</b>，不會上傳。換手機或想備份：到「⚙️ 設定」複製備份碼，貼到另一台的「匯入」。<br>
    股票頁只做計算（費用、稅、損益），不是投資建議。</p></div>`;
}

/* ======================= 記帳 ======================= */
function vBudget() {
  const e = ui.editB ? D.budget.find((x) => x.id === ui.editB) : null;
  const kind = e ? e.kind : ui.kind, cats = kind === "收入" ? D.settings.income : D.settings.expense;
  const M = budgetMonthly(D.budget, ui.year), C = budgetByCategory(D.budget, ui.year, ui.month, D.settings.expense);
  const list = D.budget.filter((x) => (x.date || "").slice(0, 4) === String(ui.year) && (!ui.month || +(x.date || "").slice(5, 7) === ui.month))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
  const maxC = Math.max(1, ...C.rows.map((r) => r.amount));
  const months = [["0", "全年"], ...Array.from({ length: 12 }, (_, i) => [String(i + 1), `${i + 1} 月`])];
  return `<h2>📒 記帳／每月收支</h2>
  <form class="card" id="fB" autocomplete="off"><h3>${e ? "修改這筆" : "記一筆"}</h3>
    <div class="row" style="margin-bottom:10px"><div class="seg" role="group" aria-label="收支">
      ${["支出", "收入"].map((k) => `<button type="button" data-kind="${k}" aria-pressed="${k === kind}">${k}</button>`).join("")}</div></div>
    <div class="grid">
      <label class="f">日期<input type="date" name="date" required value="${esc(e ? e.date : today())}"></label>
      <label class="f">類別<select name="cat">${opts(cats, e ? e.cat : cats[0])}</select></label>
      <label class="f">項目<input name="item" placeholder="例如 午餐" value="${esc(e ? e.item : "")}"></label>
      <label class="f">金額（元）<input name="amount" type="number" inputmode="decimal" min="0" step="any" required placeholder="0" value="${esc(e ? e.amount : "")}"></label>
      <label class="f">付款方式<select name="pay">${opts(D.settings.pay, e ? e.pay : D.settings.pay[0])}</select></label>
      <label class="f">備註<input name="note" value="${esc(e ? e.note : "")}"></label>
    </div>
    <div class="row" style="margin-top:10px"><button class="main">${e ? "更新" : "加入"}</button>${e ? '<button type="button" id="bCancel">取消</button>' : ""}</div>
  </form>
  <div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">每月收支</h3>
    <div class="row"><button class="sm" id="yPrev" aria-label="前一年">◀</button><b>${ui.year} 年</b><button class="sm" id="yNext" aria-label="後一年">▶</button></div></div>
    <div class="stats" style="margin:10px 0"><div><small>全年收入</small><strong>${fmt(M.total.income)}</strong></div><div><small>全年支出</small><strong>${fmt(M.total.expense)}</strong></div>
      <div><small>全年結餘</small><strong class="${sign(M.total.net)}">${fmt(M.total.net)}</strong></div></div>
    ${legend([["收入", "var(--s1)"], ["支出", "var(--s2)"]])}
    ${barChart(M.rows.map((r) => r.m + "月"), [{ name: "收入", color: "var(--s1)", values: M.rows.map((r) => r.income) }, { name: "支出", color: "var(--s2)", values: M.rows.map((r) => r.expense) }], { title: `${ui.year} 年每月收入與支出` })}
    <details style="margin-top:8px"><summary>看表格</summary><div class="tbl" style="margin-top:8px"><table><thead><tr><th>月份</th><th>收入</th><th>支出</th><th>結餘</th><th>累計結餘</th></tr></thead><tbody>
      ${M.rows.map((r) => `<tr><td>${r.m} 月</td><td>${fmt(r.income)}</td><td>${fmt(r.expense)}</td><td class="${sign(r.net)}">${fmt(r.net)}</td><td class="${sign(r.cum)}">${fmt(r.cum)}</td></tr>`).join("")}
      <tr class="total"><td>全年</td><td>${fmt(M.total.income)}</td><td>${fmt(M.total.expense)}</td><td>${fmt(M.total.net)}</td><td></td></tr></tbody></table></div></details>
  </div>
  <div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">支出類別</h3>
    <label class="row" style="font-size:13px">看<select id="bMonth" style="width:auto">${months.map(([v, l]) => `<option value="${v}"${+v === ui.month ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <p class="note">${ui.year} 年${ui.month ? ` ${ui.month} 月` : "全年"}支出共 <b>${fmt(C.total)}</b> 元</p>
    ${C.total ? `<div class="bars" style="margin-top:8px">${C.rows.filter((r) => r.amount).sort((a, b) => b.amount - a.amount).map((r) =>
      `<div class="bar${r.other ? " other" : ""}"><span>${esc(r.cat)}</span><div class="track"><div class="fill" style="width:${(r.amount / maxC * 100).toFixed(1)}%"></div></div><span class="v">${fmt(r.amount)}・${pct(r.share, 0)}</span></div>`).join("")}</div>`
      : '<p class="empty">這段期間還沒有支出</p>'}
  </div>
  <div class="card"><h3>明細（${ui.year} 年${ui.month ? ` ${ui.month} 月` : "全年"}，共 ${list.length} 筆）</h3>
    ${list.length ? `<div class="list">${list.map((x) => `<div class="item"><div class="main"><div class="t">${esc(x.item || x.cat || "（沒寫項目）")}</div>
      <div class="meta">${esc(x.date)}・<span class="badge">${esc(x.kind)}</span>${esc(x.cat || "未分類")}${x.pay ? "・" + esc(x.pay) : ""}${x.note ? "・" + esc(x.note) : ""}</div></div>
      <div><div class="amt ${x.kind === "收入" ? "pos" : ""}">${x.kind === "收入" ? "+" : "−"}${fmt(+x.amount)}</div>
      <div class="ops" style="margin-top:4px"><button class="sm" data-eb="${esc(x.id)}">改</button><button class="sm danger" data-db="${esc(x.id)}">刪</button></div></div></div>`).join("")}</div>`
      : '<p class="empty">還沒有記錄。上面記一筆試試看</p>'}
  </div>`;
}
function bindBudget() {
  const f = $("fB");
  f.querySelectorAll("[data-kind]").forEach((b) => b.onclick = () => {
    ui.kind = b.dataset.kind;
    f.querySelectorAll("[data-kind]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    f.cat.innerHTML = opts(ui.kind === "收入" ? D.settings.income : D.settings.expense);
  });
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const kind = f.querySelector('[data-kind][aria-pressed="true"]').dataset.kind;
    const amount = parseFloat(f.amount.value);
    if (!isDate(f.date.value)) return toast("請選日期");
    if (!(amount >= 0)) return toast("金額請填數字");
    const rec = { date: f.date.value, kind, cat: f.cat.value, item: f.item.value.trim(), amount, pay: f.pay.value, note: f.note.value.trim() };
    if (ui.editB) { Object.assign(D.budget.find((x) => x.id === ui.editB), rec); ui.editB = null; toast("已更新"); }
    else { D.budget.push(Object.assign({ id: nextId() }, rec)); toast(`已記下：${kind} ${fmt(amount)} 元`); }
    ui.kind = kind; ui.year = +rec.date.slice(0, 4); if (ui.month) ui.month = +rec.date.slice(5, 7);
    save(); render();
  };
  if ($("bCancel")) $("bCancel").onclick = () => { ui.editB = null; render(); };
  $("yPrev").onclick = () => { ui.year--; render(); };
  $("yNext").onclick = () => { ui.year++; render(); };
  $("bMonth").onchange = (e) => { ui.month = +e.target.value; render(); };
  document.querySelectorAll("[data-eb]").forEach((b) => b.onclick = () => { ui.editB = +b.dataset.eb; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.querySelectorAll("[data-db]").forEach((b) => b.onclick = () => {
    if (!confirm("刪掉這筆？")) return;
    D.budget = D.budget.filter((x) => x.id !== +b.dataset.db); if (ui.editB === +b.dataset.db) ui.editB = null; save(); render();
  });
}

/* ======================= 股票 ======================= */
const TYPES = ["股票", "ETF", "當沖"];
function vStock() {
  const F = D.settings.fees, e = ui.editT ? D.trades.find((x) => x.id === ui.editT) : null, side = e ? e.side : ui.side;
  const H = holdings(D.trades, F, D.prices, D.divs);
  const sum = (k) => H.reduce((a, h) => a + (h[k] || 0), 0);
  const codes = [...new Set(D.trades.map((t) => t.code))];
  const divList = D.divs.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
  const list = D.trades.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
  const pctIn = (name, v) => `<input name="${name}" type="number" inputmode="decimal" step="any" min="0" value="${esc(+(v * 100).toFixed(6))}">`;
  return `<h2>📈 股票交易紀錄</h2>
  <form class="card" id="fT" autocomplete="off"><h3>${e ? "修改這筆交易" : "記一筆交易"}</h3>
    <div class="row" style="margin-bottom:10px"><div class="seg" role="group" aria-label="買賣">
      ${["買進", "賣出"].map((k) => `<button type="button" data-side="${k}" aria-pressed="${k === side}">${k}</button>`).join("")}</div></div>
    <div class="grid">
      <label class="f">日期<input type="date" name="date" required value="${esc(e ? e.date : today())}"></label>
      <label class="f">代號<input name="code" required list="codes" placeholder="例如 0050" value="${esc(e ? e.code : "")}"><datalist id="codes">${codes.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label class="f">名稱<input name="name" placeholder="例如 元大台灣50" value="${esc(e ? e.name : "")}"></label>
      <label class="f">類型<select name="type">${opts(TYPES, e ? e.type : "股票")}</select></label>
      <label class="f">股數<input name="qty" type="number" inputmode="numeric" min="1" step="1" required placeholder="1 張＝1000" value="${esc(e ? e.qty : "")}"></label>
      <label class="f">成交價<input name="price" type="number" inputmode="decimal" min="0" step="any" required value="${esc(e ? e.price : "")}"></label>
    </div>
    <p class="note" id="tPreview">填好股數和成交價，這裡會先算給你看</p>
    <div class="row" style="margin-top:8px"><button class="main">${e ? "更新" : "加入"}</button>${e ? '<button type="button" id="tCancel">取消</button>' : ""}</div>
  </form>
  <div class="card"><h3>持股彙總（自動）</h3>
    <div class="stats" style="margin-bottom:10px"><div><small>已實現損益</small><strong class="${tw(sum("realized"))}">${fmt(sum("realized"))}</strong></div>
      <div><small>持股成本</small><strong>${fmt(sum("cost"))}</strong></div>
      <div><small>未實現損益</small><strong class="${tw(sum("unreal"))}">${H.some((h) => h.unreal !== null) ? fmt(sum("unreal")) : "—"}</strong></div>
      ${D.divs.length ? `<div><small>領到現金股利</small><strong class="${tw(sum("divCash"))}">${fmt(sum("divCash"))}</strong></div>
      <div><small>含息損益</small><strong class="${tw(sum("unrealDiv"))}">${H.some((h) => h.unrealDiv !== null) ? fmt(sum("unrealDiv")) : "—"}</strong></div>` : ""}</div>
    ${H.length ? `<div class="tbl"><table><thead><tr><th>代號</th><th class="l">名稱</th><th>目前持股</th><th>平均成本</th><th>持股成本</th><th>現價（自己填）</th><th>市值</th><th>未實現</th><th>報酬率</th><th>扣賣出成本後</th><th>報酬率（扣後）</th>${D.divs.length ? "<th>現金股利</th><th>含息損益</th><th>含息報酬率</th>" : ""}<th>已實現</th><th class="l">提醒</th></tr></thead><tbody>
      ${H.map((h) => `<tr${h.warn ? ' style="background:var(--bad-bg)"' : ""}><td>${esc(h.code)}</td><td class="l">${esc(h.name)}</td><td class="${h.qty < 0 ? "neg" : ""}">${fmt(h.qty)}</td><td>${fmt2(h.avg)}</td><td>${fmt(h.cost)}</td>
        <td><input class="px" data-code="${esc(h.code)}" type="number" inputmode="decimal" step="any" min="0" value="${h.price ?? ""}" style="width:90px;padding:4px 6px" aria-label="${esc(h.code)} 現價"></td>
        <td>${fmt(h.mv)}</td><td class="${tw(h.unreal)}">${fmt(h.unreal)}</td><td class="${tw(h.ret)}">${pct(h.ret)}</td><td class="${tw(h.unrealNet)}">${fmt(h.unrealNet)}</td><td class="${tw(h.retNet)}">${pct(h.retNet)}</td>${D.divs.length ? `<td>${fmt(h.divCash)}</td><td class="${tw(h.unrealDiv)}">${fmt(h.unrealDiv)}</td><td class="${tw(h.retDiv)}">${pct(h.retDiv)}</td>` : ""}<td class="${tw(h.realized)}">${fmt(h.realized)}</td><td class="l neg">${h.warn ? "⚠ " + h.warn : ""}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="note">平均成本法（全部買進成本÷買進股數），跟券商算法可能有小差異；「未實現」沒扣賣出時的手續費和稅；「扣賣出成本後」假設現在全部賣掉，扣掉預估的手續費和證交稅，跟多數券商 App 的預估損益同算法。「含息」是把領到的現金股利加進未實現損益（要先在下面「股息」記一筆）；配股會增加股數、不增加成本，所以平均成本會變低。只做計算，不是投資建議。</p>`
      : '<p class="empty">還沒有交易。上面記一筆，彙總會自動出現</p>'}
  </div>
  <div class="card"><h3>交易紀錄（${list.length} 筆）</h3>
    ${list.length ? `<div class="tbl"><table><thead><tr><th>日期</th><th class="l">代號</th><th class="l">買賣</th><th>股數</th><th>成交價</th><th>成交金額</th><th>手續費</th><th>交易稅</th><th>收付金額</th><th></th></tr></thead><tbody>
      ${list.map((t) => { const c = tradeCalc(t, F) || {}; return `<tr><td>${esc(t.date)}</td><td class="l">${esc(t.code)} ${esc(t.name || "")}</td><td class="l">${esc(t.side)}・${esc(t.type)}</td>
        <td>${fmt(+t.qty)}</td><td>${fmt2(+t.price)}</td><td>${fmt(c.amount)}</td><td>${fmt(c.fee)}</td><td>${fmt(c.tax)}</td><td class="${tw(c.net)}">${fmt(c.net)}</td>
        <td><button class="sm" data-et="${esc(t.id)}">改</button> <button class="sm danger" data-dt="${esc(t.id)}">刪</button></td></tr>`; }).join("")}
    </tbody></table></div>` : '<p class="empty">還沒有交易</p>'}
  </div>
  <form class="card" id="fD" autocomplete="off"><h3>記股息（現金股利、配股）</h3>
    <div class="grid">
      <label class="f">日期<input type="date" name="date" required value="${esc(today())}"></label>
      <label class="f">代號<input name="code" required list="codes" placeholder="例如 2801"></label>
      <label class="f">現金股利（實拿的錢）<input name="cash" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></label>
      <label class="f">配股（股數）<input name="shares" type="number" inputmode="numeric" min="0" step="1" placeholder="0"></label>
    </div>
    <p class="note">現金股利填你戶頭<b>實際收到</b>的金額（已扣二代健保、匯費）。配股填多出幾股，這幾股成本算 0，所以平均成本會變低。上面「記一筆交易」只記你自己買賣的股數，<b>配股不要重複記進去</b>。</p>
    <div class="row" style="margin-top:8px"><button class="main">記下股息</button></div>
    ${divList.length ? `<div class="tbl" style="margin-top:10px"><table><thead><tr><th>日期</th><th class="l">代號</th><th>現金股利</th><th>配股</th><th></th></tr></thead><tbody>
      ${divList.map((d) => `<tr><td>${esc(d.date)}</td><td class="l">${esc(d.code)}</td><td>${fmt(d.cash)}</td><td>${fmt(d.shares)}</td><td><button type="button" class="sm danger" data-dd="${esc(d.id)}">刪</button></td></tr>`).join("")}
    </tbody></table></div>` : ""}
  </form>
  <details class="card" id="feeBox"><summary>費用與稅率（依你的券商調整）</summary>
    <form id="fF" class="grid" style="margin-top:10px">
      <label class="f">手續費率（%）${pctIn("rate", F.rate)}</label>
      <label class="f">手續費折扣（%，6 折填 60）${pctIn("disc", F.disc)}</label>
      <label class="f">最低手續費（元）<input name="min" type="number" inputmode="decimal" min="0" step="any" value="${esc(F.min)}"></label>
      <label class="f">證交稅：股票（%）${pctIn("taxStock", F.taxStock)}</label>
      <label class="f">證交稅：ETF（%）${pctIn("taxEtf", F.taxEtf)}</label>
      <label class="f">證交稅：當沖（%）${pctIn("taxDay", F.taxDay)}</label>
      <div class="row" style="grid-column:1/-1"><button class="main">儲存費率</button><button type="button" id="feeReset">回到預設</button></div>
    </form>
    <p class="note">預設：手續費上限 0.1425%、整股最低 20 元（零股依券商）；證交稅賣出才收，股票 0.3%、ETF 0.1%、現股當沖 0.15%（減半實施到 2027/12/31）。ETF 當沖請選「ETF」。</p>
  </details>`;
}
function bindStock() {
  const f = $("fT"), F = D.settings.fees;
  const preview = () => {
    const side = f.querySelector('[data-side][aria-pressed="true"]').dataset.side;
    const c = tradeCalc({ side, type: f.type.value, qty: f.qty.value, price: f.price.value }, F);
    $("tPreview").textContent = c ? `成交金額 ${fmt(c.amount)}・手續費 ${fmt(c.fee)}・交易稅 ${fmt(c.tax)}・${side === "買進" ? "要付" : "會拿到"} ${fmt(Math.abs(c.net))} 元` : "填好股數和成交價，這裡會先算給你看";
  };
  f.querySelectorAll("[data-side]").forEach((b) => b.onclick = () => { ui.side = b.dataset.side; f.querySelectorAll("[data-side]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); preview(); });
  ["qty", "price", "type"].forEach((n) => f[n].addEventListener("input", preview));
  f.code.addEventListener("change", () => { const old = D.trades.find((t) => t.code === f.code.value.trim() && t.name); if (old && !f.name.value) f.name.value = old.name; });
  preview();
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const side = f.querySelector('[data-side][aria-pressed="true"]').dataset.side;
    const rec = { date: f.date.value, code: f.code.value.trim(), name: f.name.value.trim(), side, type: f.type.value, qty: parseInt(f.qty.value, 10), price: parseFloat(f.price.value) };
    if (!isDate(rec.date) || !rec.code) return toast("請填日期和代號");
    if (!tradeCalc(rec, F)) return toast("股數、成交價請填正數");
    if (ui.editT) { Object.assign(D.trades.find((x) => x.id === ui.editT), rec); ui.editT = null; toast("已更新"); }
    else { D.trades.push(Object.assign({ id: nextId() }, rec)); toast(`已記下：${side} ${rec.code} ${fmt(rec.qty)} 股`); }
    ui.side = "買進"; save(); render();   // 下一筆回到「買進」，免得連續記錯方向
  };
  if ($("tCancel")) $("tCancel").onclick = () => { ui.editT = null; render(); };
  document.querySelectorAll("input.px").forEach((i) => i.onchange = () => {
    const v = parseFloat(i.value); if (v > 0) D.prices[i.dataset.code] = v; else delete D.prices[i.dataset.code]; save(); render();
  });
  document.querySelectorAll("[data-et]").forEach((b) => b.onclick = () => { ui.editT = +b.dataset.et; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.querySelectorAll("[data-dt]").forEach((b) => b.onclick = () => {
    if (!confirm("刪掉這筆交易？")) return;
    D.trades = D.trades.filter((x) => x.id !== +b.dataset.dt); if (ui.editT === +b.dataset.dt) ui.editT = null; save(); render();
  });
  const fd = $("fD");
  fd.onsubmit = (ev) => {
    ev.preventDefault();
    const rec = { date: fd.date.value, code: fd.code.value.trim(), cash: parseFloat(fd.cash.value) || 0, shares: parseInt(fd.shares.value, 10) || 0 };
    if (!isDate(rec.date) || !rec.code) return toast("請填日期和代號");
    if (!(rec.cash > 0) && !(rec.shares > 0)) return toast("現金股利或配股至少填一個");
    if (rec.cash < 0 || rec.shares < 0) return toast("請填 0 以上的數字");
    D.divs.push(Object.assign({ id: nextId() }, rec)); save(); render(); toast(`已記下股息：${rec.code}`);
  };
  document.querySelectorAll("[data-dd]").forEach((b) => b.onclick = () => {
    if (!confirm("刪掉這筆股息？")) return;
    D.divs = D.divs.filter((x) => x.id !== +b.dataset.dd); save(); render();
  });
  const ff = $("fF");
  ff.onsubmit = (ev) => {
    ev.preventDefault();
    const p = (n) => parseFloat(ff[n].value) / 100;
    const nf = { rate: p("rate"), disc: p("disc"), min: parseFloat(ff.min.value), taxStock: p("taxStock"), taxEtf: p("taxEtf"), taxDay: p("taxDay") };
    if (Object.values(nf).some((v) => !(v >= 0))) return toast("費率請填 0 以上的數字");
    D.settings.fees = nf; save(); render(); $("feeBox").open = true; toast("費率已儲存，全部重新計算");
  };
  $("feeReset").onclick = () => { D.settings.fees = clone(DEFAULTS.fees); save(); render(); $("feeBox").open = true; toast("已回到預設費率"); };
}

/* ======================= 萬用清單 ======================= */
function dueBadge(d) {
  if (d === null) return "";
  if (d < 0) return `<span class="badge due-bad">逾期 ${-d} 天</span>`;
  if (d === 0) return '<span class="badge due-soon">今天到期</span>';
  return `<span class="badge${d <= 3 ? " due-soon" : ""}">剩 ${d} 天</span>`;
}
function vTodo() {
  const t = today(), s = todoStats(D.todos, t), e = ui.editD ? D.todos.find((x) => x.id === ui.editD) : null;
  const order = { 高: 0, 中: 1, 低: 2 };
  let list = D.todos.filter((x) => (ui.todoShow === "open" ? x.state !== "完成" : ui.todoShow === "done" ? x.state === "完成" : true) && (!ui.todoCat || x.cat === ui.todoCat));
  list.sort((a, b) => {
    if ((a.state === "完成") !== (b.state === "完成")) return a.state === "完成" ? 1 : -1;
    const da = daysLeft(a, t), db = daysLeft(b, t);
    if ((da === null) !== (db === null)) return da === null ? 1 : -1;
    return (da ?? 0) - (db ?? 0) || (order[a.pri] ?? 1) - (order[b.pri] ?? 1) || a.id - b.id;
  });
  return `<h2>✅ 萬用清單／待辦</h2>
  <div class="card"><div class="stats"><div><small>待辦</small><strong>${s.todo}</strong></div><div><small>進行中</small><strong>${s.doing}</strong></div>
    <div><small>完成</small><strong>${s.done}</strong></div><div><small>逾期</small><strong class="${s.overdue ? "neg" : ""}">${s.overdue}</strong></div><div><small>3 天內到期</small><strong>${s.soon}</strong></div></div></div>
  <form class="card" id="fD" autocomplete="off"><h3>${e ? "修改這項" : "加一項"}</h3>
    <div class="grid">
      <label class="f" style="grid-column:1/-1">項目<input name="title" required placeholder="例如 繳電話費" value="${esc(e ? e.title : "")}"></label>
      <label class="f">分類<select name="cat">${opts(D.settings.todoCats, e ? e.cat : D.settings.todoCats[0])}</select></label>
      <label class="f">負責人<input name="who" placeholder="我" value="${esc(e ? e.who : "")}"></label>
      <label class="f">優先<select name="pri">${opts(PRIORITIES, e ? e.pri : "中")}</select></label>
      <label class="f">狀態<select name="state">${opts(TODO_STATES, e ? e.state : "待辦")}</select></label>
      <label class="f">開始日<input type="date" name="start" value="${esc(e ? e.start : today())}"></label>
      <label class="f">到期日<input type="date" name="due" value="${esc(e ? e.due : "")}"></label>
      <label class="f" style="grid-column:1/-1">備註<input name="note" value="${esc(e ? e.note : "")}"></label>
    </div>
    <div class="row" style="margin-top:10px"><button class="main">${e ? "更新" : "加入"}</button>${e ? '<button type="button" id="dCancel">取消</button>' : ""}</div>
  </form>
  <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px">
    <div class="seg" role="group" aria-label="顯示">${[["open", "未完成"], ["all", "全部"], ["done", "完成"]].map(([k, l]) => `<button type="button" data-show="${k}" aria-pressed="${ui.todoShow === k}">${l}</button>`).join("")}</div>
    <select id="dCat" style="width:auto"><option value="">全部分類</option>${D.settings.todoCats.map((c) => `<option${c === ui.todoCat ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
    ${list.length ? `<div class="list">${list.map((x) => { const d = daysLeft(x, t);
      return `<div class="item${x.state === "完成" ? " done" : d !== null && d < 0 ? " overdue" : d !== null && d <= 3 ? " soon" : ""}"><div class="main">
        <div class="t">${x.pri === "高" ? '<span class="badge hi">高</span>' : ""}${esc(x.title)}</div>
        <div class="meta">${dueBadge(d)}${esc(x.cat || "")}${x.who ? "・" + esc(x.who) : ""}${x.due ? `・到期 ${esc(x.due)}` : ""}${x.state === "完成" && x.doneDate ? `・${esc(x.doneDate)} 完成` : ""}${x.note ? "・" + esc(x.note) : ""}</div></div>
        <div class="ops"><select class="st" data-id="${esc(x.id)}" style="width:auto;padding:4px 6px;font-size:13px" aria-label="狀態">${opts(TODO_STATES, x.state)}</select>
        <button class="sm" data-ed="${esc(x.id)}">改</button><button class="sm danger" data-dd="${esc(x.id)}">刪</button></div></div>`; }).join("")}</div>`
      : `<p class="empty">${D.todos.length ? "這個篩選沒有項目" : "清單是空的。上面加一項試試看"}</p>`}
    <p class="note">紅底＝逾期；橘底＝3 天內到期；完成的會劃掉，排在最後。</p>
  </div>`;
}
function bindTodo() {
  const f = $("fD");
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const rec = { title: f.title.value.trim(), cat: f.cat.value, who: f.who.value.trim(), pri: f.pri.value, state: f.state.value, start: f.start.value, due: f.due.value, note: f.note.value.trim() };
    if (!rec.title) return toast("請寫項目");
    if (ui.editD) { const x = D.todos.find((y) => y.id === ui.editD); if (rec.state === "完成" && x.state !== "完成") rec.doneDate = today(); Object.assign(x, rec); ui.editD = null; toast("已更新"); }
    else { if (rec.state === "完成") rec.doneDate = today(); D.todos.push(Object.assign({ id: nextId() }, rec)); toast("已加入清單"); }
    save(); render();
  };
  if ($("dCancel")) $("dCancel").onclick = () => { ui.editD = null; render(); };
  document.querySelectorAll("[data-show]").forEach((b) => b.onclick = () => { ui.todoShow = b.dataset.show; render(); });
  $("dCat").onchange = (e) => { ui.todoCat = e.target.value; render(); };
  document.querySelectorAll("select.st").forEach((s) => s.onchange = () => {
    const x = D.todos.find((y) => y.id === +s.dataset.id); if (!x) return;
    x.state = s.value; x.doneDate = s.value === "完成" ? today() : ""; save(); render(); if (s.value === "完成") toast("完成 ✓");
  });
  document.querySelectorAll("[data-ed]").forEach((b) => b.onclick = () => { ui.editD = +b.dataset.ed; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.querySelectorAll("[data-dd]").forEach((b) => b.onclick = () => {
    if (!confirm("刪掉這項？")) return;
    D.todos = D.todos.filter((x) => x.id !== +b.dataset.dd); if (ui.editD === +b.dataset.dd) ui.editD = null; save(); render();
  });
}

/* ======================= 資料分析 ======================= */
const STATS = [["筆數", "count", "df[欄].count()", 0], ["平均數", "mean", "df[欄].mean()"], ["中位數", "median", "df[欄].median()"], ["眾數（多個取第一個）", "mode", "df[欄].mode()"],
  ["標準差（樣本）", "std", "df[欄].std()"], ["變異數（樣本）", "var", "df[欄].var()"], ["最小值", "min", "df[欄].min()"], ["第 1 四分位數", "q1", "df[欄].quantile(0.25)"],
  ["第 3 四分位數", "q3", "df[欄].quantile(0.75)"], ["最大值", "max", "df[欄].max()"], ["全距", "range", "df[欄].max()-df[欄].min()"], ["總和", "sum", "df[欄].sum()"]];
function corrColor(r) {   // 藍＝正相關、橘＝負相關、白＝沒關係
  if (r === null) return "";
  const a = Math.min(1, Math.abs(r)), c = r >= 0 ? "42,120,214" : "235,104,52";
  return `background:rgba(${c},${(a * .75).toFixed(2)});${a > .55 ? "color:#fff;" : ""}`;
}
function vAnalysis() {
  const tbl = parseTable(D.table), nc = numericCols(tbl), H = tbl.headers;
  let body = "";
  if (!tbl.rows.length) body = '<div class="card"><p class="empty">還沒有資料。從 Excel 選取一整塊（含第一列欄名）複製，貼到上面；或按「用範例資料」</p></div>';
  else if (!nc.length) body = '<div class="card"><p class="empty">沒找到數字欄。第一列要是欄名，下面是資料</p></div>';
  else {
    const D2 = nc.map((i) => describe(colNums(tbl, i)));
    if (ui.hist === null || !nc.includes(ui.hist)) ui.hist = nc[0];
    const others = H.map((_, i) => i).filter((i) => !nc.includes(i));
    if (ui.gcol === null || ui.gcol >= H.length) ui.gcol = others.length ? others[0] : 0;
    if (ui.vcol === null || !nc.includes(ui.vcol)) ui.vcol = nc[0];
    const hist = histogram(colNums(tbl, ui.hist), 10), dec = hist.length && hist[0].hi - hist[0].lo < 0.1 ? 2 : 1;
    const G = groupBy(tbl, ui.gcol, ui.vcol);
    const colSel = (id, sel, list) => `<select id="${id}" style="width:auto">${list.map((i) => `<option value="${i}"${i === sel ? " selected" : ""}>${esc(H[i])}</option>`).join("")}</select>`;
    body = `<div class="card"><h3>敘述統計</h3><div class="tbl"><table><thead><tr><th>統計項目</th>${nc.map((i) => `<th>${esc(H[i])}</th>`).join("")}<th class="l">Python（pandas）</th></tr></thead><tbody>
      ${STATS.map(([lab, k, py, d]) => `<tr><td>${lab}</td>${D2.map((s) => `<td>${s[k] === undefined || s[k] === null ? "—" : d === 0 ? s[k] : fmt2(s[k])}</td>`).join("")}<td class="code">${esc(py)}</td></tr>`).join("")}
      </tbody></table></div><p class="note">一次看全部：<code>df.describe()</code>（標準差、變異數用樣本 n−1，和 Excel 的 STDEV、pandas 一樣）</p></div>
    <div class="card"><h3>相關係數</h3><p class="note" style="margin:0 0 8px">−1～1：越接近 1 越「一起變大」，越接近 −1 越「一個大一個小」，0 附近沒什麼關係</p>
      <div class="tbl"><table class="corr"><thead><tr><th></th>${nc.map((i) => `<th>${esc(H[i])}</th>`).join("")}</tr></thead><tbody>
      ${nc.map((i) => `<tr><td style="text-align:left;font-weight:600">${esc(H[i])}</td>${nc.map((j) => { const r = correl(tbl, i, j); return `<td style="${corrColor(r)}">${r === null ? "—" : r.toFixed(2)}</td>`; }).join("")}</tr>`).join("")}
      </tbody></table></div><p class="note"><code>df.corr(numeric_only=True)</code></p></div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">次數分配（直方圖，10 組）</h3>${colSel("hCol", ui.hist, nc)}</div>
      ${barChart(hist.map((b) => b.lo.toFixed(dec)), [{ name: "次數", color: "var(--s1)", values: hist.map((b) => b.count) }], { h: 200, title: H[ui.hist] + " 次數分配" })}
      <details><summary>看表格</summary><div class="tbl" style="margin-top:8px"><table><thead><tr><th>組別</th><th>次數</th><th>比例</th></tr></thead><tbody>
        ${hist.map((b, k) => `<tr><td>${b.lo.toFixed(dec)}～${b.hi.toFixed(dec)}${k === hist.length - 1 ? "（含）" : ""}</td><td>${b.count}</td><td>${pct(b.count / colNums(tbl, ui.hist).length)}</td></tr>`).join("")}
      </tbody></table></div></details><p class="note"><code>df[欄].plot.hist(bins=10)</code>　橫軸是每組的下限</p></div>
    <div class="card"><h3>分組彙總（像樞紐分析）</h3>
      <div class="row" style="margin-bottom:8px;font-size:13px">依${colSel("gCol", ui.gcol, H.map((_, i) => i))}分組，看${colSel("vCol", ui.vcol, nc)}</div>
      <div class="tbl"><table><thead><tr><th>${esc(H[ui.gcol])}</th><th>筆數</th><th>平均</th><th>最小</th><th>最大</th><th>總和</th></tr></thead><tbody>
      ${G.slice(0, 200).map((g) => `<tr><td>${esc(g.group)}</td><td>${g.count}</td><td>${fmt2(g.mean)}</td><td>${fmt2(g.min)}</td><td>${fmt2(g.max)}</td><td>${fmt2(g.sum)}</td></tr>`).join("")}
      </tbody></table></div>${G.length > 200 ? `<p class="note">組別太多，只顯示前 200 組（共 ${G.length} 組）</p>` : ""}
      <p class="note"><code>df.groupby('${esc(H[ui.gcol])}')['${esc(H[ui.vcol])}'].agg(['count','mean','min','max','sum'])</code></p></div>`;
  }
  return `<h2>📊 資料分析練習</h2>
  <div class="card"><h3>貼上資料</h3>
    <textarea id="aText" rows="6" wrap="off" placeholder="從 Excel 選取一整塊（第一列是欄名）複製，貼在這裡。也可以貼逗號分隔的 CSV" spellcheck="false" style="font:13px/1.4 ui-monospace,Consolas,monospace">${esc(D.table)}</textarea>
    <div class="row" style="margin-top:8px"><button type="button" id="aSample">用範例資料</button><button type="button" id="aClear">清空</button>
      ${tbl.rows.length ? `<span class="pill">${tbl.rows.length} 列 × ${H.length} 欄・數字欄：${nc.map((i) => esc(H[i])).join("、") || "沒有"}</span>` : ""}</div>
  </div>${body}`;
}
function bindAnalysis() {
  let t = 0;
  $("aText").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { D.table = e.target.value; save(); const pos = e.target.selectionStart; render(); const a = $("aText"); a.focus(); a.setSelectionRange(pos, pos); }, 600); });
  $("aSample").onclick = () => { if (D.table && D.table !== SAMPLE && !confirm("用範例資料換掉現在貼的資料？")) return; D.table = SAMPLE; ui.hist = ui.gcol = ui.vcol = null; save(); render(); };
  $("aClear").onclick = () => { if (D.table && !confirm("清空貼上的資料？")) return; D.table = ""; save(); render(); };
  if ($("hCol")) $("hCol").onchange = (e) => { ui.hist = +e.target.value; render(); };
  if ($("gCol")) $("gCol").onchange = (e) => { ui.gcol = +e.target.value; render(); };
  if ($("vCol")) $("vCol").onchange = (e) => { ui.vcol = +e.target.value; render(); };
}

/* ======================= 設定 ======================= */
function vSettings() {
  const ta = (id, label, list) => `<label class="f">${label}<textarea id="${id}" rows="6">${esc(list.join("\n"))}</textarea></label>`;
  const n = D.budget.length + D.trades.length + D.divs.length + D.todos.length;
  return `<h2>⚙️ 設定</h2>
  <div class="card"><h3>下拉選單的選項</h3><p class="note" style="margin:0 0 8px">一行一個。改名不會改到已經記的資料。</p>
    <div class="grid">${ta("sIncome", "收入類別", D.settings.income)}${ta("sExpense", "支出類別", D.settings.expense)}${ta("sPay", "付款方式", D.settings.pay)}${ta("sTodo", "清單分類", D.settings.todoCats)}</div>
    <div class="row" style="margin-top:10px"><button class="main" id="sSave">儲存選項</button><button id="sReset">回到預設</button></div></div>
  <div class="card"><h3>備份／搬到另一台裝置</h3>
    <p class="note" style="margin:0 0 8px">資料只存在這台裝置的瀏覽器（目前 ${n} 筆紀錄）。清除瀏覽器資料就會不見，建議偶爾備份一次。</p>
    <div class="row"><button class="main" id="bCopy">複製備份碼</button><span class="note" style="margin:0">複製後貼到 LINE 給自己、或存在記事本</span></div>
    <label class="f" style="margin-top:12px">匯入備份碼（會<b>取代</b>這台裝置的全部資料）<textarea id="bIn" rows="3" placeholder="把備份碼貼在這裡"></textarea></label>
    <div class="row" style="margin-top:8px"><button id="bImport">匯入</button></div></div>
  <div class="card"><h3>清除</h3><p class="note" style="margin:0 0 8px">刪掉這台裝置上的全部紀錄和設定，不能復原。先複製備份碼比較保險。</p>
    <button class="danger" id="wipe">清除全部資料</button></div>`;
}
function bindSettings() {
  const lines = (id) => [...new Set($(id).value.split("\n").map((s) => s.trim()).filter(Boolean))];
  $("sSave").onclick = () => {
    const s = { income: lines("sIncome"), expense: lines("sExpense"), pay: lines("sPay"), todoCats: lines("sTodo") };
    if (Object.values(s).some((l) => !l.length)) return toast("每一欄至少要留一個選項");
    Object.assign(D.settings, s); save(); render(); toast("選項已儲存");
  };
  $("sReset").onclick = () => { if (!confirm("選項回到預設？（已記的資料不會動）")) return; for (const k of ["income", "expense", "pay", "todoCats"]) D.settings[k] = clone(DEFAULTS[k]); save(); render(); toast("已回到預設"); };
  $("bCopy").onclick = async () => {
    const code = exportCode(D);
    try { await navigator.clipboard.writeText(code); toast("備份碼已複製"); }
    catch (e) { $("bIn").value = code; $("bIn").select(); toast("瀏覽器不讓自動複製：備份碼放在下面的框裡，請按住複製"); }
  };
  $("bImport").onclick = () => {
    const d = importCode($("bIn").value);
    if (!d) return toast("看不懂這個備份碼（要整段完整貼上）");
    if (!confirm(`匯入會取代這台裝置的全部資料（記帳 ${d.budget.length}、交易 ${d.trades.length}、股息 ${d.divs.length}、清單 ${d.todos.length} 筆），確定？`)) return;
    D = d; save(); render(); toast("匯入完成");
  };
  $("wipe").onclick = () => {
    if (!confirm("真的要清除全部資料？不能復原")) return;
    if (!confirm("再確認一次：全部清除？")) return;
    D = newData(); save(); render(); toast("已清除");
  };
}

/* ---------- 切換畫面 ---------- */
const VIEWS = { home: [vHome], budget: [vBudget, bindBudget], stock: [vStock, bindStock], todo: [vTodo, bindTodo], analysis: [vAnalysis, bindAnalysis], settings: [vSettings, bindSettings] };
function render() {
  const [view, bind] = VIEWS[ui.view] || VIEWS.home;
  $("view").innerHTML = view();
  if (bind) bind();
  document.querySelectorAll("nav.tabs a").forEach((a) => { if (a.dataset.v === ui.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}
function route() {
  const v = location.hash.slice(1);
  const next = VIEWS[v] ? v : "home";
  if (next !== ui.view) { ui.editB = ui.editT = ui.editD = null; window.scrollTo(0, 0); }
  ui.view = next; render();
}
window.addEventListener("hashchange", route);
// 別的分頁改了資料：重新讀
window.addEventListener("storage", (e) => { if (e.key === KEY) { D = load(); render(); } });

/* ---------- 安裝到桌面、版本 ---------- */
let installEvt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("install").hidden = false; });
$("install").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("install").hidden = true; };
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
(function () {
  const v = document.querySelector('meta[name="app-version"]').content, b = document.querySelector('meta[name="app-built"]').content;
  $("ver").textContent = `taco個人辦公室・版本 ${v}${b ? "（" + b + "）" : ""}`;
})();
route();
