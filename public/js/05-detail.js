"use strict";
// 05-detail.js — 檢視卡（回顧頁大讀值）
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ---------- 檢視卡：回顧頁像量測中一樣的大讀值 ---------- */
function renderDetail() {
  const card = $("detailCard"); if (!card) return;
  const list = displayedCands();
  const c = (S.selected && list.includes(S.selected)) ? S.selected : list[list.length - 1];
  if (!c) {
    $("dcVal").textContent = "—"; $("dcUnit").textContent = "";
    $("dcMode").textContent = "—"; $("dcRange").textContent = "—";
    $("dcTime").textContent = ""; $("dcNote").textContent = "";
    $("dcVerdict").style.display = "none";
    return;
  }
  S.selected = c;
  const mc = MODE_COLOR[MODE_GROUP[c.kind]] || "#4c9aff";
  card.style.setProperty("--modecol", mc);
  $("dcMode").textContent = MODE_LABEL[c.kind] || c.kind;
  $("dcRange").textContent = c.rangeName || "AUTO";
  $("dcVal").textContent = c.disp;
  $("dcUnit").textContent = c.unit;
  $("dcTime").textContent = fmtT(c.tStart) + "（" + (c.source === "manual" ? "手動" : "自動") + "）";
  $("dcNote").textContent = c.note ? "測點：" + c.note : "";
  const dv = $("dcVerdict");
  if (c.verdict) { dv.style.display = ""; dv.className = "tag " + c.verdict; dv.textContent = c.verdict === "ok" ? "✓ 正常" : "✗ 異常"; }
  else dv.style.display = "none";
  drawDcWave(c, mc);
}
/* 檢視卡內嵌波形：該筆量測前後 ±6 秒，量測段以色帶標示 */
function drawDcWave(c, col) {
  const wv = $("dcWave"); if (!wv || wv.offsetParent === null) return;
  const W = wv.clientWidth, H = wv.clientHeight, dpr = devicePixelRatio || 1;
  if (!W || !H) return;
  if (wv.width !== W * dpr || wv.height !== H * dpr) { wv.width = W * dpr; wv.height = H * dpr; }
  const x = wv.getContext("2d");
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, W, H);
  const ARR = S.viewSamples || S.samples;
  const t0 = c.tStart - 6000, t1 = c.tEnd + 6000;
  const fam = BASE_UNIT[c.kind];
  const pts = ARR.filter(s => s.t >= t0 && s.t <= t1 && s.v !== null && BASE_UNIT[s.kind] === fam);
  x.strokeStyle = cssVar("--grid"); x.strokeRect(0.5, 0.5, W - 1, H - 20);
  x.fillStyle = cssVar("--ink3"); x.font = "10.5px " + cssVar("--font");
  if (pts.length < 2) { x.fillText("（此段無波形樣本）", 10, (H - 20) / 2); return; }
  let vMin = Infinity, vMax = -Infinity;
  for (const p of pts) { if (p.v < vMin) vMin = p.v; if (p.v > vMax) vMax = p.v; }
  if (vMax - vMin < 1e-12) { const pd = Math.max(Math.abs(vMax) * .05, 1e-9); vMin -= pd; vMax += pd; }
  else { const pd = (vMax - vMin) * .15; vMin -= pd; vMax += pd; }
  const X2 = t => ((t - t0) / (t1 - t0)) * W;
  const Y2 = v => 5 + (1 - (v - vMin) / (vMax - vMin)) * (H - 30);
  x.fillStyle = cssVar("--band-auto");
  x.fillRect(Math.max(0, X2(c.tStart)), 1, Math.max(3, Math.min(W, X2(c.tEnd)) - X2(c.tStart)), H - 21);
  x.strokeStyle = col; x.lineWidth = 2; x.lineJoin = "round";
  x.beginPath(); let pen = false, pv = 0;
  for (const p of pts) { const px2 = X2(p.t), py2 = Y2(p.v); if (!pen || p.t - pv > 1500) { x.moveTo(px2, py2); pen = true; } else x.lineTo(px2, py2); pv = p.t; }
  x.stroke(); x.lineWidth = 1;
  x.fillStyle = cssVar("--ink3");
  x.fillText(fmtT(t0), 2, H - 6); x.textAlign = "right"; x.fillText(fmtT(t1), W - 2, H - 6); x.textAlign = "left";
}
$("btnCheckAll").addEventListener("click", () => {
  const list = displayedCands();
  const all = list.every(c => c.checked);
  list.forEach(c => { c.checked = !all; dbPut("candidates", c); });
  renderCands();
});
$("btnClear").addEventListener("click", () => {
  if (!confirm("清除本次 session 的候選與標記？（原始樣本保留在 IndexedDB）")) return;
  for (const c of S.candidates) { try { db.transaction("candidates", "readwrite").objectStore("candidates").delete(c.id); } catch (e) {} }
  S.candidates = []; S.markers = []; renderCands();
});
