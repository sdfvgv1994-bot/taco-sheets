/* taco 試算表：雲端同步（Firebase）。
   用 Google 帳號登入後，資料在雲端存一份（users/<帳號代號>），手機和電腦看到同一份。
   - 每次存檔（app.js 的 save）都會順便上傳；別台改了，這台會自動收到。
   - 哪一份比較新用 core.js 的 syncPick 決定；被雲端蓋掉之前，這台原本的資料會先備份（app.js 的 replaceData）。
   - 沒網路、Firebase 載不到：App 照常用這台裝置的資料，不會壞。
   firebaseConfig 是公開資訊（每個用 Firebase 的網站都看得到），資料安全靠 Firestore 規則：只有登入的本人能讀寫自己的那一份。 */
"use strict";
(function () {
  const CFG = {
    apiKey: "AIzaSyCCFBTEqg-Ox9EscNMv79vmKHHl7feszEw",
    authDomain: "taco-sheets.firebaseapp.com",
    projectId: "taco-sheets",
    storageBucket: "taco-sheets.firebasestorage.app",
    messagingSenderId: "541096317783",
    appId: "1:541096317783:web:3be7a00998e8a01192a412",
  };
  const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
  const LIMIT = 900000;   // Firestore 一份文件上限 1MB，留一點空間
  const T = window.tacoApp;
  let fb = null, user = null, ready = false, unsub = null, timer = 0;
  let state = "雲端功能載入中…";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function setState(s) { state = s; paint(); }

  /* 設定頁的「雲端同步」卡片 */
  function paint() {
    const el = document.getElementById("syncCard");
    if (!el) return;
    const who = user ? `<p style="margin:0 0 8px">已登入：<b>${esc(user.email || user.displayName || "Google 帳號")}</b></p>` : "";
    const btn = !ready ? "" : user
      ? `<button id="syncOut">登出</button><span class="note" style="margin:0">登出後，這台的資料還在，只是不再同步</span>`
      : `<button class="main" id="syncIn">用 Google 帳號登入</button><span class="note" style="margin:0">手機、電腦登入同一個帳號，就會看到同一份資料</span>`;
    el.innerHTML = `<h3>☁️ 雲端同步</h3>${who}<p class="note" style="margin:0 0 8px">狀態：${esc(state)}</p><div class="row">${btn}</div>`;
    const i = document.getElementById("syncIn"), o = document.getElementById("syncOut");
    if (i) i.onclick = login;
    if (o) o.onclick = logout;
  }

  async function login() {
    if (!fb) return T.toast("雲端還沒載好，等一下或檢查網路");
    const p = new fb.au.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    try { await fb.au.signInWithPopup(fb.auth, p); }
    catch (e) {
      // 彈出視窗被擋（有些手機、安裝到桌面的 App）：改成整頁跳去登入再跳回來
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return fb.au.signInWithRedirect(fb.auth, p);
      if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") T.toast("登入失敗：" + (e.code || e.message));
    }
  }
  async function logout() {
    if (!fb) return;
    if (!confirm("登出雲端同步？（這台的資料會留著）")) return;
    await fb.au.signOut(fb.auth);
    T.toast("已登出");
  }

  const ref = () => fb.fs.doc(fb.db, "users", user.uid);

  /* 這台有改動：等 0.8 秒（連續改只傳一次）再上傳 */
  function push() {
    if (!fb || !user) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const d = T.get(), json = JSON.stringify(d);
      if (json.length > LIMIT) return setState("資料太大（超過 0.9MB），雲端存不下；這台的資料照常保存");
      setState(navigator.onLine === false ? "沒網路：已存在這台，有網路會自動上傳" : "上傳中…");
      try {
        await fb.fs.setDoc(ref(), { app: "taco-sheets", json, updatedAt: d.updatedAt || 0, n: countRecords(d) });
        setState("已同步 ✓");
      } catch (e) { setState("上傳失敗（" + (e.code || e.message) + "），下次有改動會再試"); }
    }, 800);
  }

  /* 雲端那份有變（第一次登入、或別台改了） */
  function onCloud(snap) {
    if (snap.metadata.hasPendingWrites) return;   // 這是自己剛傳的，還沒到雲端
    let cloud = null;
    if (snap.exists()) { try { cloud = JSON.parse(snap.data().json); } catch (e) { cloud = null; } }
    const pick = syncPick(T.get(), cloud);
    if (pick === "pull") {
      T.replace(cloud);
      setState("已同步 ✓（拿到雲端最新的資料）");
      T.toast("已換成雲端最新的資料");
    } else if (pick === "push") push();
    else setState("已同步 ✓");
  }

  function onUser(u) {
    user = u;
    if (unsub) { unsub(); unsub = null; }
    if (!u) return setState("沒登入：資料只存在這台裝置");
    setState("檢查雲端資料中…");
    unsub = fb.fs.onSnapshot(ref(), onCloud, (e) => setState("讀不到雲端（" + (e.code || e.message) + "）"));
  }

  async function boot() {
    try {
      const [a, au, fs] = await Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-firestore.js")]);
      const app = a.initializeApp(CFG);
      fb = { au, fs, auth: au.getAuth(app), db: fs.getFirestore(app) };
      ready = true;
      au.getRedirectResult(fb.auth).catch((e) => T.toast("登入失敗：" + (e.code || e.message)));
      au.onAuthStateChanged(fb.auth, onUser);
    } catch (e) {
      setState("沒網路或載不到雲端功能：先用這台裝置的資料，App 照常能用");
    }
  }

  window.tacoSync = { changed: push, paint };
  paint();
  boot();
})();
