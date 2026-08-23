"use strict";
// 12-settings.js — 擷取參數、除錯面板、風格切換
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ---------- 擷取參數設定 ---------- */
if ($("btnCfg")) {
  const sync = () => {
    $("cfgMs").value = PLATEAU_MS / 1000; $("cfgTol").value = REL_TOL * 100;
    $("cfgMsVal").textContent = (PLATEAU_MS / 1000).toFixed(1) + " 秒";
    $("cfgTolVal").textContent = "±" + (REL_TOL * 100).toFixed(1) + "%";
  };
  const save = () => { try { localStorage.setItem("dm40cfg", JSON.stringify({ ms: PLATEAU_MS, tol: REL_TOL })); } catch (e) {} };
  $("btnCfg").addEventListener("click", () => {
    const p = $("cfgPanel");
    p.style.display = p.style.display === "block" ? "none" : "block";
    sync();
  });
  $("cfgMs").addEventListener("input", e => { PLATEAU_MS = Math.round(e.target.value * 1000); sync(); save(); });
  $("cfgTol").addEventListener("input", e => { REL_TOL = e.target.value / 100; sync(); save(); });
  $("cfgReset").addEventListener("click", () => { PLATEAU_MS = 1200; REL_TOL = 0.005; sync(); save(); });
  document.addEventListener("click", e => {
    const p = $("cfgPanel");
    if (p.style.display === "block" && !p.contains(e.target) && !$("btnCfg").contains(e.target)) p.style.display = "none";
  });
}

/* ---------- 除錯面板 ---------- */
if ($("btnDbg")) {
  $("btnDbg").addEventListener("click", () => {
    const p = $("dbgPanel");
    const open = p.style.display === "none" || !p.style.display;
    p.style.display = open ? "flex" : "none";
    if (open) { $("dbgLog").textContent = DBG.lines.slice(-120).join("\n") || "(尚無紀錄——按「連線 DM40」開始)"; }
  });
  $("btnDbgClose").addEventListener("click", () => $("dbgPanel").style.display = "none");
  setInterval(() => {
    if ($("dbgPanel").style.display === "flex")
      $("dbgStat").textContent = `RX ${DBG.rx} 包 · TX ${DBG.tx} 筆 · 樣本 ${S.pktCount} · CRC失敗 ${S.crcFail}`;
  }, 500);
  $("btnDbgCopy").addEventListener("click", async () => {
    let avail = "?"; try { avail = navigator.bluetooth ? String(await navigator.bluetooth.getAvailability()) : "no-api"; } catch (e) { avail = "err"; }
    const diag = [
      "=== DM40 Logger 診斷 ===",
      "UA: " + navigator.userAgent,
      "Web Bluetooth: " + (navigator.bluetooth ? "有" : "無") + " / availability=" + avail + (navigator.brave ? " / BRAVE" : ""),
      "裝置: " + (bleDevice ? (bleDevice.name || "(無名)") + " id=" + bleDevice.id + " connected=" + (bleDevice.gatt && bleDevice.gatt.connected) : "未選擇"),
      `計數: RX=${DBG.rx} TX=${DBG.tx} 樣本=${S.pktCount} CRC失敗=${S.crcFail}`,
      "--- log ---",
      ...DBG.lines
    ].join("\n");
    try { await navigator.clipboard.writeText(diag); toast("診斷已複製，直接貼給 Claude"); }
    catch (e) { dlog("複製失敗 " + e.name); }
  });
}
/* ---------- 風格切換 ---------- */
(function () {
  const set = s => {
    document.documentElement.dataset.skin = s;
    document.querySelectorAll(".skins button").forEach(b => b.classList.toggle("on", b.dataset.skin === s));
    try { localStorage.setItem("dm40skin", s); } catch (e) {}
  };
  document.querySelectorAll(".skins button").forEach(b => b.addEventListener("click", () => set(b.dataset.skin)));
  let saved = "carbon"; try { saved = localStorage.getItem("dm40skin") || "carbon"; } catch (e) {}
  set(saved);
})();
