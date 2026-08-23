"use strict";
// 02-state.js — 全域狀態 S、DOM 小工具、toast、IndexedDB 持久化
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ================================================================
   狀態與資料
   ================================================================ */
const S = {
  samples: [],          // {t, v, kind, unit, disp, rangeName}
  candidates: [], markers: [],
  connected: false, sim: false,
  crcFail: 0, pktCount: 0, rateWin: [],
  session: "S" + new Date().toISOString().slice(2, 16).replace(/[-T:]/g, ""),
  follow: true, viewSpan: 60e3, viewEnd: null,
  candSeq: 0,
  filterG: "*", filterQ: "", browse: null, viewSamples: null,
  selected: null, lastM: null, ctx: "", widget: "spark",
};
try { S.ctx = localStorage.getItem("dm40ctx") || ""; S.widget = localStorage.getItem("dm40widget") || "spark"; } catch (e) {}
function displayedCands() {
  const list = S.browse ? S.browse.cands : S.candidates;
  return list.filter(c =>
    (S.filterG === "*" || MODE_GROUP[c.kind] === S.filterG) &&
    (!S.filterQ || (c.note || "").toLowerCase().includes(S.filterQ) || (MODE_LABEL[c.kind] || "").includes(S.filterQ))
  );
}
const $ = id => document.getElementById(id);
const fmtT = t => new Date(t).toTimeString().slice(0, 8);
function toast(msg) { const el = $("toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 2200); }
setInterval(() => { $("sbClock").textContent = new Date().toTimeString().slice(0, 8); }, 1000);

/* ---------- IndexedDB ---------- */
let db = null;
(function initDB() {
  const rq = indexedDB.open("dm40logger", 1);
  rq.onupgradeneeded = e => {
    const d = e.target.result;
    d.createObjectStore("candidates", { keyPath: "id" });
    d.createObjectStore("chunks", { autoIncrement: true });
  };
  rq.onsuccess = e => {
    db = e.target.result;
    const tx = db.transaction("candidates", "readonly").objectStore("candidates").getAll();
    tx.onsuccess = () => {
      const prev = tx.result.filter(c => c.session === S.session);
      for (const c of prev) S.candidates.push(c);
      renderCands();
    };
  };
})();
function dbPut(store, val) { if (!db) return; try { db.transaction(store, "readwrite").objectStore(store).put(val); } catch (e) {} }
function dbAdd(store, val) { if (!db) return; try { db.transaction(store, "readwrite").objectStore(store).add(val); } catch (e) {} }
let flushBuf = [];
function flushSamples(force) {
  if (flushBuf.length >= 300 || (force && flushBuf.length)) {
    dbAdd("chunks", { session: S.session, rows: flushBuf });
    flushBuf = [];
  }
}
setInterval(() => flushSamples(true), 15000);
