"""taco 試算表網站的檢查：core.js 的規則（用 node 跑），數字要和 Excel 版一樣；App 檔案齊全。"""
import json
import random
import re
import shutil
import statistics
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def node(js):
    """在 node 裡載入 core.js（變數 c），回傳 console.log 印出的 JSON。"""
    if not shutil.which("node"):
        return None
    code = "const c=require(process.argv[1]);" + js
    out = subprocess.run(["node", "-e", code, str(ROOT / "core.js")], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def test_budget_month_and_category():
    out = node("""
    const e=[{date:"2026-10-01",kind:"收入",cat:"薪資",amount:35000},{date:"2026-10-02",kind:"支出",cat:"餐飲",amount:110},
      {date:"2026-10-03",kind:"支出",cat:"交通",amount:"500"},{date:"2026-10-05",kind:"支出",cat:"居住",amount:9000},
      {date:"2026-10-08",kind:"支出",cat:"電信網路",amount:499},{date:"2026-10-09",kind:"支出",cat:"",amount:300},
      {date:"2026-10-10",kind:"支出",cat:"寵物",amount:700},{date:"2025-10-10",kind:"支出",cat:"餐飲",amount:999},
      {date:"不是日期",kind:"支出",cat:"餐飲",amount:5}];
    const m=c.budgetMonthly(e,2026),k=c.budgetByCategory(e,2026,10,c.DEFAULTS.expense),all=c.budgetByCategory(e,2026,0,c.DEFAULTS.expense);
    console.log(JSON.stringify({oct:m.rows[9],nov:m.rows[10],total:m.total,cat:k.rows.filter(r=>r.amount).map(r=>[r.cat,r.amount]),ktotal:k.total,
      share:k.rows.reduce((a,r)=>a+r.share,0),alltotal:all.total}));""")
    if out is None:
        return
    assert out["oct"] == {"m": 10, "income": 35000, "expense": 11109, "net": 23891, "cum": 23891}
    assert out["nov"]["cum"] == 23891 and out["total"] == {"income": 35000, "expense": 11109, "net": 23891}
    assert out["cat"] == [["餐飲", 110], ["交通", 500], ["居住", 9000], ["電信網路", 499], ["未分類／其他", 1000]]
    assert out["ktotal"] == 11109 and abs(out["share"] - 1) < 1e-9 and out["alltotal"] == 11109


def test_stock_fees_tax_and_holdings():
    out = node("""
    const f=c.DEFAULTS.fees;
    const T=[{code:"0000",name:"範例",side:"買進",type:"股票",qty:1000,price:50},{code:"0000",side:"賣出",type:"股票",qty:500,price:55},
      {code:"006208",name:"富邦台50",side:"買進",type:"ETF",qty:1000,price:100},{code:"6208",name:"日揚",side:"買進",type:"股票",qty:1000,price:30},
      {code:"6208",side:"",type:"股票",qty:500,price:31},{code:"0050",side:"賣出",type:"ETF",qty:3000,price:150},
      {code:"2330",side:"賣出",type:"當沖",qty:1000,price:1000},{code:"9999",side:"買進",type:"股票",qty:10,price:12}];
    const calc=T.map(t=>c.tradeCalc(t,f)),disc=c.tradeCalc({side:"買進",type:"股票",qty:1000,price:50},Object.assign({},f,{disc:0.6}));
    const H=c.holdings(T,f,{"0000":52});
    console.log(JSON.stringify({calc,disc,H:H.map(h=>[h.code,h.buyQty,h.buyCost,h.avg,h.sellQty,h.sellNet,h.realized,h.qty,h.cost,h.mv,h.unreal,h.warn,h.sellCost,h.unrealNet])}));""")
    if out is None:
        return
    c = out["calc"]
    assert c[0] == {"amount": 50000, "fee": 71, "tax": 0, "net": -50071}
    assert c[1] == {"amount": 27500, "fee": 39, "tax": 82, "net": 27379}
    assert c[4] is None                                   # 沒選買賣：不算
    assert c[5]["tax"] == 450 and c[6]["tax"] == 1500     # ETF 0.1%、當沖 0.15%
    assert c[7]["fee"] == 20                              # 不足最低手續費
    assert out["disc"]["fee"] == 42                       # 6 折：50000×0.1425%×0.6＝42.75 → 42
    h = {r[0]: r for r in out["H"]}
    assert h["0000"][1:9] == [1000, 50071, 50.071, 500, 27379, 2343.5, 500, 25035.5]
    assert h["0000"][9] == 26000 and h["0000"][10] == 964.5
    # 預估賣出成本：500 股×52＝26000，手續費 37（26000×0.1425%＝37.05）、證交稅 78（0.3%）→ 115
    assert h["0000"][12] == 115 and h["0000"][13] == 964.5 - 115
    assert h["9999"][12] is None                             # 沒填現價：不估
    assert h["006208"][1] == 1000 and h["6208"][1] == 1000   # 006208 和 6208 不會混在一起
    assert h["0050"][7] == -3000 and h["0050"][11] == "賣出比買進多"


def test_todo_days_and_stats():
    out = node("""
    const t=[{state:"待辦",due:"2026-10-25"},{state:"進行中",due:"2026-10-27"},{state:"完成",due:"2026-10-01"},
      {state:"暫停",due:"2026-10-20"},{state:"待辦",due:""},{state:"待辦",due:"2026/10/30"},{state:"待辦",due:"2026-10-22"}];
    console.log(JSON.stringify({d:t.map(x=>c.daysLeft(x,"2026-10-22")),s:c.todoStats(t,"2026-10-22")}));""")
    if out is None:
        return
    assert out["d"] == [3, 5, None, -2, None, None, 0]
    assert out["s"] == {"todo": 4, "doing": 1, "done": 1, "paused": 1, "open": 6, "overdue": 1, "soon": 2}


def sample_rows():
    """和 Excel 版一樣的範例資料（同一個亂數種子）。"""
    rnd = random.Random(618)
    rows = []
    for i in range(30):
        cls = "ABC"[i % 3]
        study = round(rnd.uniform(0.5, 4.5), 1)
        sleep = round(rnd.uniform(5.5, 8.5), 1)
        phone = round(max(0.5, 6 - study + rnd.uniform(-1, 1)), 1)
        math = int(min(100, max(20, 45 + study * 10 + (sleep - 7) * 3 + rnd.gauss(0, 8) + (5 if cls == "A" else 0))))
        eng = int(min(100, max(20, 50 + study * 7 + rnd.gauss(0, 10))))
        rows.append([cls, math, eng, study, sleep, phone])
    return rows


def test_analysis_matches_excel_and_python():
    rows = sample_rows()
    text = "\n".join(["班級\t數學\t英文\t讀書時數\t睡眠時數\t手機時數"] + ["\t".join(map(str, r)) for r in rows])
    out = node("""
    const tbl=c.parseTable(%s),cols=c.numericCols(tbl),math=c.colNums(tbl,1);
    console.log(JSON.stringify({h:tbl.headers,n:tbl.rows.length,cols,d:c.describe(math),r:c.correl(tbl,1,3),
      hist:c.histogram(math,10).map(b=>b.count),g:c.groupBy(tbl,0,1),csv:c.parseTable("a,b\\n1,2\\n3,").rows,
      one:c.describe([5]),empty:c.describe([]),flat:c.histogram([2,2,2],10).map(b=>b.count)}));""" % json.dumps(text))
    if out is None:
        return
    m = [r[1] for r in rows]
    d = out["d"]
    assert out["h"][0] == "班級" and out["n"] == 30 and out["cols"] == [1, 2, 3, 4, 5]
    assert d["count"] == 30 and abs(d["mean"] - statistics.mean(m)) < 1e-9 and d["median"] == statistics.median(m)
    assert abs(d["std"] - statistics.stdev(m)) < 1e-9 and abs(d["var"] - statistics.variance(m)) < 1e-9
    # Excel 版算出來的值（taco通用試算表.xlsx 資料分析頁）
    assert (round(d["mean"], 4), d["median"], d["mode"], d["q1"], d["q3"], d["min"], d["max"], d["sum"]) == (73.8667, 73.5, 53, 62.5, 83.75, 46, 99, 2216)
    assert abs(out["r"] - 0.861236451914339) < 1e-9
    assert out["hist"] == [1, 3, 4, 2, 4, 4, 4, 3, 1, 4] and sum(out["hist"]) == 30
    assert [(g["group"], g["count"], round(g["mean"], 1), g["min"], g["max"], g["sum"]) for g in out["g"]] == [
        ("A", 10, 79.3, 61, 96, 793), ("B", 10, 66.6, 46, 99, 666), ("C", 10, 75.7, 55, 97, 757)]
    assert out["csv"] == [["1", "2"], ["3", ""]]
    assert out["one"]["count"] == 1 and out["one"]["std"] is None and out["empty"] == {"count": 0}
    assert sum(out["flat"]) == 3


def test_backup_roundtrip_and_bad_input():
    out = node("""
    const d=c.newData();d.budget.push({id:1,date:"2026-10-01",kind:"收入",cat:"薪資",amount:1});d.settings.fees.disc=0.6;
    const back=c.importCode(c.exportCode(d));
    console.log(JSON.stringify({ok:back.budget.length===1&&back.settings.fees.disc===0.6&&back.settings.expense.length===12,
      bad:[c.importCode("亂打"),c.importCode('{"app":"別的"}')],fill:c.importCode('{"app":"taco-sheets","budget":"x"}').budget}));""")
    if out is None:
        return
    assert out["ok"] and out["bad"] == [None, None] and out["fill"] == []


def test_app_files():
    m = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    assert m["scope"] == "./" and m["start_url"] == "./" and m["display"] == "standalone"
    for i in m["icons"]:
        assert (ROOT / i["src"]).is_file(), i["src"]
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert re.findall(r'<script src="([^"]+)"', html) == ["core.js", "app.js"]
    assert '<meta name="app-version" content="dev">' in html and re.search(r"\[hidden\]\{display:none!important\}", html)
    assert (ROOT / "sw.js").is_file()
    assert "site/index.html" in (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")


def test_bad_backup_is_cleaned():
    """改過的備份碼：奇怪的 id、null、非數字費率都要被清掉，不能塞程式碼進畫面。"""
    out = node("""
    const d=c.importCode(JSON.stringify({app:"taco-sheets",seq:1,budget:[null,{id:'1"><img src=x onerror=alert(1)>',date:"2026-10-01",kind:"支出",amount:1},{id:5},{id:5}],
      trades:[null,"x",[1]],todos:[{id:2}],settings:{fees:{min:'20"><b>',rate:"0.001425"},expense:["餐飲",3,"<b>x</b>"]},prices:{"0050":"abc","2330":1000}}));
    console.log(JSON.stringify({ids:d.budget.map(x=>x.id),trades:d.trades.length,todo:d.todos.map(x=>x.id),seq:d.seq,min:d.settings.fees.min,rate:d.settings.fees.rate,
      exp:d.settings.expense,prices:d.prices}));""")
    if out is None:
        return
    ids = out["ids"]
    assert all(isinstance(i, int) and i > 0 for i in ids) and len(set(ids + out["todo"])) == len(ids) + 1
    assert out["trades"] == 0 and out["seq"] > max(ids + out["todo"])
    assert out["min"] == 20 and out["rate"] == 0.001425 and out["prices"] == {"2330": 1000}
    assert out["exp"] == ["餐飲", "<b>x</b>"]   # 文字照存，畫面顯示時會轉義


def test_numbers_and_csv_quotes():
    out = node("""
    const t=c.parseTable("日期\\t金額\\t比例\\n2026/10/1\\t100\\t12%\\n2026/10/2\\t1,234\\t3號");
    const q=c.parseTable('名稱,金額\\n\\x22台北, 大安\\x22,\\x221,234\\x22\\n\\x22說\\x22\\x22好\\x22\\x22\\x22,5');
    console.log(JSON.stringify({cols:c.numericCols(t),sum:c.colNums(t,1).reduce((a,b)=>a+b,0),q:q.rows,qcols:c.numericCols(q)}));""")
    if out is None:
        return
    assert out["cols"] == [1] and out["sum"] == 1334
    assert out["q"] == [["台北, 大安", "1,234"], ['說"好"', "5"]] and out["qcols"] == [1]


def test_offline_home_not_overwritten():
    """離線快取：直接開 manifest.json 不會把首頁蓋掉；升級後第一次離線也打得開；只清自己的舊存放區。"""
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    # 只有打開首頁才存到首頁的位置（直接開 manifest.json 不會把首頁蓋掉）
    assert "const home = nav &&" in sw and 'includes("text/html")' in sw
    # 換新存放區；只清自己舊版的（同網域其他 App 的不能刪），而且要新版存齊了才清
    assert 'const PREFIX = "taco-sheets"' in sw and 'const CACHE = PREFIX + "-v2"' in sw
    assert "k.startsWith(PREFIX) && k !== CACHE" in sw and "hits.every(Boolean)" in sw
    # 沒網路時先找自己這一版的存放區
    assert "caches.open(CACHE).then((c) => c.match(key))" in sw
    # 網頁用到的每個程式檔、樣式檔都要預先存好，升級後第一次離線才打得開
    core = re.search(r"const CORE = \[(.*?)\];", sw, re.S).group(1)
    for f in re.findall(r'<script src="([^"]+)"', html) + re.findall(r'<link rel="stylesheet" href="([^"]+)"', html):
        if not f.startswith("http"):
            assert '"./' + f + '"' in core, f


def test_dividends_cash_and_stock():
    """股息：現金股利直接進含息損益；配股多股數、成本不變（平均成本變低）；壞資料會被清掉。"""
    out = node("""
    const f=c.DEFAULTS.fees;
    const T=[{code:"2801",side:"買進",type:"股票",qty:1000,price:20}];
    const D=[{code:"2801",date:"2026-08-01",cash:800,shares:25},{code:"2801",cash:-5,shares:"x"}];
    const H=c.holdings(T,f,{"2801":30},D)[0], H0=c.holdings(T,f,{"2801":30})[0];
    const Hs=c.holdings(T.concat([{code:"2801",side:"賣出",type:"股票",qty:1025,price:30}]),f,{},D)[0];
    const N=c.normalize({divs:[{code:"2801",cash:"abc",shares:2.9},null,5,{cash:3},{code:"2801",cash:-1,shares:-1}],trades:[{id:5}]});
    console.log(JSON.stringify({H:[H.qty,H.avg,H.cost,H.mv,H.unreal,H.divCash,H.divShares,H.unrealDiv,H.retDiv],H0:[H0.qty,H0.avg,H0.divCash,H0.unrealDiv],
      S:[Hs.qty,Hs.realized],N:N.divs,seq:N.seq}));""")
    if out is None:
        return
    h = out["H"]
    assert h[0] == 1025 and abs(h[1] - 20028 / 1025) < 1e-9 and h[2] == 20028      # 配股不加成本
    assert h[3] == 30750 and h[4] == 10722 and h[5] == 800 and h[6] == 25
    assert h[7] == 11522 and abs(h[8] - 11522 / 20028) < 1e-12                     # 含息＝價差＋現金股利
    assert out["H0"] == [1000, 20.028, 0, 9972]                                    # 沒傳股息：跟以前一模一樣
    # 全賣掉：賣 1025 股，收 30750-手續費-稅；平均成本已因配股變低
    assert out["S"][0] == 0
    assert out["N"] == [{"code": "2801", "cash": 0, "shares": 2, "id": out["N"][0]["id"]},
                        {"code": "2801", "cash": 0, "shares": 0, "id": out["N"][1]["id"]}]
    assert out["N"][0]["id"] != out["N"][1]["id"] and out["seq"] > max(5, out["N"][0]["id"], out["N"][1]["id"])


def test_per_trade_fee_override():
    """單筆手續費／交易稅可以自己填：有填用填的，沒填照費率；壞值當沒填；持股成本跟著變。"""
    out = node("""
    const f=c.DEFAULTS.fees;
    const base={side:"買進",type:"股票",qty:1000,price:20.45};
    const A=c.tradeCalc(base,f), B=c.tradeCalc(Object.assign({feeFix:5},base),f), Z=c.tradeCalc(Object.assign({feeFix:0},base),f);
    const bad=c.tradeCalc(Object.assign({feeFix:"abc",taxFix:-3},base),f), blank=c.tradeCalc(Object.assign({feeFix:"",taxFix:null},base),f);
    const S={side:"賣出",type:"ETF",qty:232,price:32.23};
    const S0=c.tradeCalc(S,f), S1=c.tradeCalc(Object.assign({feeFix:2,taxFix:7},S),f), Sb=c.tradeCalc(Object.assign({},S,{side:"買進",taxFix:9}),f);
    const H=c.holdings([Object.assign({code:"2801",feeFix:8},base)],f,{})[0];
    const N=c.normalize({trades:[{code:"1",feeFix:"x",taxFix:"4"},{code:"2",feeFix:null}]}).trades;
    console.log(JSON.stringify({A:[A.fee,A.net],B:[B.fee,B.net],Z:[Z.fee],bad:[bad.fee,bad.tax],blank:[blank.fee],S0:[S0.fee,S0.tax],S1:[S1.fee,S1.tax,S1.net],Sb:[Sb.tax],H:[H.buyCost],N:N.map(t=>[t.feeFix,t.taxFix])}));""")
    if out is None:
        return
    assert out["A"][0] == 29 and out["B"] == [5, -(20450 + 5)] and out["Z"] == [0]   # 填 0 也算填
    assert out["bad"] == [29, 0] and out["blank"] == [29]                              # 壞值、空白＝沒填
    assert out["S0"][1] == 7 and out["S1"][:2] == [2, 7] and abs(out["S1"][2] - (7477.36 - 9)) < 1e-6 and out["Sb"] == [0]  # 買進不收稅，填了也不算
    assert out["H"] == [20458]                                                           # 持股成本用填的手續費 8
    assert out["N"] == [[None, 4], [None, None]]
