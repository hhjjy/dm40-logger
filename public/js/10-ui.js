"use strict";
// 10-ui.js — 視圖切換、情境標籤、截圖、篩選、歷史場次
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ---------- 雙情境視圖切換 ---------- */
function setView(v) {
  document.body.dataset.view = v;
  $("tabMeasure").classList.toggle("on", v === "measure");
  $("tabReview").classList.toggle("on", v === "review");
  if (v === "review") { refreshSessionSel(); renderDetail(); }
}
if ($("tabMeasure")) {
  $("tabMeasure").addEventListener("click", () => setView("measure"));
  $("tabReview").addEventListener("click", () => setView("review"));
  document.addEventListener("keydown", e => {
    if (e.code === "Tab" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      e.preventDefault();
      setView(document.body.dataset.view === "measure" ? "review" : "measure");
    }
    // ↑↓ 在回顧頁切換檢視的紀錄
    if (document.body.dataset.view === "review" && (e.code === "ArrowUp" || e.code === "ArrowDown") &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      e.preventDefault();
      const list = displayedCands(); if (!list.length) return;
      let idx = list.indexOf(S.selected); if (idx < 0) idx = list.length - 1;
      idx = Math.max(0, Math.min(list.length - 1, idx + (e.code === "ArrowUp" ? 1 : -1)));
      S.selected = list[idx]; renderDetail();
      S.follow = false; S.viewEnd = S.selected.tEnd + S.viewSpan * 0.3;
    }
  });
}

/* ---------- 量測情境標籤（點大數字或 ✎ 設定） ---------- */
function renderCtx() {
  const el = $("ctxChip"); if (!el) return;
  el.textContent = S.ctx ? "✎ " + S.ctx : "✎ 設定量測情境";
  el.classList.toggle("set", !!S.ctx);
}
function editCtx() {
  const v = prompt("現在在量什麼？（會自動帶入新紀錄的備註與截圖，例如：MMSO-0009 NIBP板 C301）", S.ctx || "");
  if (v === null) return;
  S.ctx = v.trim();
  try { localStorage.setItem("dm40ctx", S.ctx); } catch (e) {}
  renderCtx();
  toast(S.ctx ? "量測情境已設定：" + S.ctx : "已清除量測情境");
}
if ($("ctxChip")) {
  $("ctxChip").addEventListener("click", editCtx);
  $("heroVal").addEventListener("click", editCtx);
  renderCtx();
}

/* ---------- 即時截圖（量測頁 → 剪貼簿圖卡） ---------- */
if ($("btnShot")) $("btnShot").addEventListener("click", () => {
  const m = S.lastM;
  const last = S.samples[S.samples.length - 1];
  if (!m || !last) { toast("還沒有數據可截圖"); return; }
  copySnapshot({
    tStart: last.t, tEnd: last.t,
    kind: m.kind, rangeName: m.rangeName, unit: m.unit,
    disp: m.ol ? "OL" : m.disp, value: m.value,
    note: S.ctx || "", source: "live", session: S.session
  });
});

/* ---------- 曲線 / 儀表切換 ---------- */
if ($("wtoggle")) {
  const applyW = () => {
    document.body.dataset.widget = S.widget;
    document.querySelectorAll("#wtoggle span").forEach(x => x.classList.toggle("on", x.dataset.w === S.widget));
  };
  $("wtoggle").addEventListener("click", e => {
    const s = e.target.closest("span[data-w]"); if (!s) return;
    S.widget = s.dataset.w;
    try { localStorage.setItem("dm40widget", S.widget); } catch (e2) {}
    applyW();
  });
  applyW();
}

/* ---------- 篩選（模式／備註搜尋） ---------- */
if ($("fchips")) {
  $("fchips").addEventListener("click", e => {
    const fc = e.target.closest(".fc"); if (!fc) return;
    S.filterG = fc.dataset.f;
    document.querySelectorAll(".fc").forEach(x => x.classList.toggle("on", x === fc));
    renderCands();
  });
  $("searchNote").addEventListener("input", e => { S.filterQ = e.target.value.trim().toLowerCase(); renderCands(); });
}
if ($("dcSnap")) $("dcSnap").addEventListener("click", () => { if (S.selected) copySnapshot(S.selected); });

/* ---------- 歷史場次瀏覽 ---------- */
function refreshSessionSel() {
  const sel = $("sessionSel"); if (!sel || !db) return;
  const rq = db.transaction("candidates", "readonly").objectStore("candidates").getAll();
  rq.onsuccess = () => {
    const bySes = {};
    for (const c of rq.result) (bySes[c.session] = bySes[c.session] || []).push(c);
    if (!bySes[S.session]) bySes[S.session] = [];
    const sessions = Object.keys(bySes).sort().reverse();
    const cur = S.browse ? S.browse.session : S.session;
    sel.innerHTML = sessions.map(s => {
      const label = (s === S.session ? "▶ 本次" : "20" + s.slice(1, 7).replace(/^(..)(..)(..)$/, "$1-$2-$3") + " " + s.slice(7, 9) + ":" + s.slice(9, 11)) + "（" + bySes[s].length + " 筆）";
      return `<option value="${s}" ${s === cur ? "selected" : ""}>${label}</option>`;
    }).join("");
  };
}
if ($("sessionSel")) $("sessionSel").addEventListener("mousedown", refreshSessionSel);
if ($("sessionSel")) $("sessionSel").addEventListener("change", e => {
  const ses = e.target.value;
  if (ses === S.session) {
    S.browse = null; S.viewSamples = null; S.follow = true; S.viewEnd = null; S.viewSpan = 60e3; S.selected = null;
    renderCands(); return;
  }
  const store = t => db.transaction(t, "readonly").objectStore(t).getAll();
  const rq1 = store("candidates");
  rq1.onsuccess = () => {
    const cands = rq1.result.filter(c => c.session === ses).sort((a, b) => a.tStart - b.tStart);
    const rq2 = store("chunks");
    rq2.onsuccess = () => {
      const samples = [];
      for (const ch of rq2.result) if (ch.session === ses)
        for (const r of ch.rows) samples.push({ t: r[0], v: (r[1] === "OL" ? null : r[1]), kind: r[2], disp: r[3], unit: r[4] });
      samples.sort((a, b) => a.t - b.t);
      S.browse = { session: ses, cands };
      S.viewSamples = samples;
      S.follow = false; S.selected = null;
      if (samples.length) {
        const span = Math.max(10e3, Math.min(15 * 60e3, (samples[samples.length - 1].t - samples[0].t) * 1.1));
        S.viewSpan = span; S.viewEnd = samples[samples.length - 1].t + span * 0.05;
      }
      $("btnFollow").style.display = "none";
      renderCands();
      toast("正在瀏覽歷史場次（" + cands.length + " 筆）——匯出/複製/快照都可用");
    };
  };
});
