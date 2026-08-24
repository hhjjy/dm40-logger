"use strict";
// 13-hold.js — 用電表本體的 HOLD 鍵當標記觸發
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）
//
// 為什麼是 HOLD：協議每一幀本來就回報 hold（01-protocol.js:71），
// 但先前只拿來顯示一個小標籤。改成「按下即標記」，手完全不用離開表筆。

/* ---------- 純邏輯：偵測 hold 由 false 轉 true ---------- */
// 只認上升緣——按著不放不會連續觸發。無 DOM 相依，可單獨測試。
function holdRising(state, hold) {
  const h = !!hold;
  const rising = h && !state.prev;
  state.prev = h;
  return rising;
}

const HOLD = { prev: false, enabled: false };
try { HOLD.enabled = localStorage.getItem("dm40hold") === "1"; } catch (e) {}

/* ---------- 每一幀呼叫（由 renderLive 掛進來）---------- */
function holdTick(m) {
  const h = m && m.hold;
  if (!HOLD.enabled) { HOLD.prev = !!h; return; }   // 關閉時仍要追狀態，免得開啟瞬間誤觸發
  if (holdRising(HOLD, h)) doMark();
}

/* ---------- 設定開關 ---------- */
(function () {
  const el = document.getElementById("holdToggle");
  if (!el) return;
  el.checked = HOLD.enabled;
  el.addEventListener("change", () => {
    HOLD.enabled = el.checked;
    try { localStorage.setItem("dm40hold", el.checked ? "1" : "0"); } catch (e) {}
    if (typeof toast === "function")
      toast(el.checked ? "電表 HOLD 鍵 → 標記" : "已關閉 HOLD 觸發");
  });
})();
