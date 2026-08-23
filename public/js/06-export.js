"use strict";
// 06-export.js — 匯出 CSV/Markdown、量測快照圖卡
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ---------- 匯出 ---------- */
function dlBlob(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + text], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
$("btnCsvSel").addEventListener("click", () => {
  const rows = displayedCands().filter(c => c.checked);
  if (!rows.length) { toast("沒有勾選任何紀錄"); return; }
  let csv = "no,time,mode,range,value,unit,base_value,verdict,source,note\n";
  rows.forEach((c, i) => {
    csv += [i + 1, new Date(c.tStart).toISOString(), c.kind, c.rangeName, c.disp, c.unit, c.value, c.verdict || "", c.source, `"${(c.note || "").replace(/"/g, '""')}"`].join(",") + "\n";
  });
  dlBlob(`dm40_${S.session}_selected.csv`, csv, "text/csv");
});
$("btnCsvRaw").addEventListener("click", () => {
  let csv = "timestamp_iso,base_value,mode,display,unit\n";
  for (const s of S.samples) csv += [new Date(s.t).toISOString(), s.v ?? "OL", s.kind, s.disp, s.unit].join(",") + "\n";
  dlBlob(`dm40_${S.session}_raw.csv`, csv, "text/csv");
});
/* ---------- 量測快照圖卡：值＋模式＋當時波形 → 圖片進剪貼簿 ---------- */
async function copySnapshot(c) {
  try { await document.fonts.load('500 100px SGro'); await document.fonts.load('400 15px InterE'); } catch (e) {}
  const W = 880, H = 470, dpr = 2, PAD = 44;
  const cv2 = document.createElement("canvas"); cv2.width = W * dpr; cv2.height = H * dpr;
  const x = cv2.getContext("2d"); x.scale(dpr, dpr);
  const col = MODE_COLOR[MODE_GROUP[c.kind]] || "#4c9aff";
  x.fillStyle = "#0e1013"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#15181d"; x.beginPath(); x.roundRect(10, 10, W - 20, H - 20, 18); x.fill();
  x.strokeStyle = "rgba(255,255,255,.08)"; x.stroke();
  x.font = "600 15px InterE, sans-serif";
  const modeTxt = MODE_LABEL[c.kind] || c.kind;
  const mw = x.measureText(modeTxt).width + 26;
  x.fillStyle = col + "22"; x.beginPath(); x.roundRect(PAD, 36, mw, 30, 8); x.fill();
  x.strokeStyle = col + "77"; x.stroke();
  x.fillStyle = col; x.fillText(modeTxt, PAD + 13, 56);
  x.fillStyle = "#9aa1ab";
  let hdr = (c.rangeName || "AUTO") + " 檔";
  if (c.verdict === "ok") hdr += " · ✓ 正常"; if (c.verdict === "ng") hdr += " · ✗ 異常";
  x.fillText(hdr, PAD + mw + 16, 56);
  x.textAlign = "right";
  x.font = "400 14px InterE, sans-serif";
  const srcTxt = c.source === "manual" ? "手動標記" : c.source === "live" ? "即時截圖" : "自動擷取";
  x.fillText(new Date(c.tStart).toLocaleString("zh-TW") + "（" + srcTxt + "）", W - PAD, 56);
  x.textAlign = "left";
  x.fillStyle = col;
  x.font = "500 96px SGro, InterE, sans-serif";
  x.fillText(c.disp, PAD, 175);
  const vw = x.measureText(c.disp).width;
  x.font = "700 40px SGro, InterE, sans-serif";
  x.fillStyle = "#c3c2b7"; x.fillText(c.unit, PAD + vw + 16, 172);
  if (c.note) { x.fillStyle = "#eceef1"; x.font = "600 19px InterE, sans-serif"; x.fillText("測點：" + c.note, PAD, 215); }
  const ARR = S.viewSamples || S.samples;
  const t0 = c.tStart - 6000, t1 = c.tEnd + 6000;
  const fam = BASE_UNIT[c.kind];
  const pts = ARR.filter(s => s.t >= t0 && s.t <= t1 && s.v !== null && BASE_UNIT[s.kind] === fam);
  const gx = PAD, gy = 245, gw = W - PAD * 2, gh = 150;
  x.strokeStyle = "rgba(255,255,255,.1)"; x.strokeRect(gx, gy, gw, gh);
  if (pts.length > 1) {
    let vMin = Infinity, vMax = -Infinity;
    for (const p of pts) { if (p.v < vMin) vMin = p.v; if (p.v > vMax) vMax = p.v; }
    if (vMax - vMin < 1e-12) { const pd = Math.max(Math.abs(vMax) * .05, 1e-9); vMin -= pd; vMax += pd; }
    else { const pd = (vMax - vMin) * .15; vMin -= pd; vMax += pd; }
    const X2 = t => gx + ((t - t0) / (t1 - t0)) * gw;
    const Y2 = v => gy + 8 + (1 - (v - vMin) / (vMax - vMin)) * (gh - 16);
    x.fillStyle = col + "26";
    x.fillRect(Math.max(gx, X2(c.tStart)), gy, Math.max(3, Math.min(gx + gw, X2(c.tEnd)) - X2(c.tStart)), gh);
    x.strokeStyle = col; x.lineWidth = 2.5; x.lineJoin = "round";
    x.beginPath(); let pen = false, pv = 0;
    for (const p of pts) { const px2 = X2(p.t), py2 = Y2(p.v); if (!pen || p.t - pv > 1500) { x.moveTo(px2, py2); pen = true; } else x.lineTo(px2, py2); pv = p.t; }
    x.stroke(); x.lineWidth = 1;
    x.fillStyle = "#646b76"; x.font = "400 12px InterE, sans-serif";
    x.fillText(fmtT(t0), gx, gy + gh + 18); x.textAlign = "right"; x.fillText(fmtT(t1), gx + gw, gy + gh + 18); x.textAlign = "left";
  } else {
    x.fillStyle = "#646b76"; x.font = "400 14px InterE, sans-serif";
    x.fillText("（此段無波形樣本）", gx + 14, gy + gh / 2);
  }
  x.fillStyle = "#52565e"; x.font = "400 12.5px InterE, sans-serif";
  x.fillText("DM40 Logger · session " + (c.session || S.session), PAD, H - 28);
  DBG.lastSnap = cv2.toDataURL("image/png");
  cv2.toBlob(async blob => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("📷 快照圖卡已複製——貼給 Claude 或任何地方");
    } catch (e) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `dm40_snap_${fmtT(c.tStart).replace(/:/g, "")}.png`; a.click();
      toast("剪貼簿不可用，已改為下載圖卡");
    }
  }, "image/png");
}

function buildMdTable() {
  const rows = displayedCands().filter(c => c.checked);
  if (!rows.length) return null;
  let md = `## DM40C 量測紀錄（${new Date().toLocaleString("zh-TW")}，session ${S.browse ? S.browse.session : S.session}）\n\n`;
  md += "| # | 時間 | 模式 | 檔位 | 數值 | 判定 | 來源 | 測點/備註 |\n|---|------|------|------|------|------|------|-----------|\n";
  rows.forEach((c, i) => {
    const v = c.verdict === "ok" ? "✅ 正常" : c.verdict === "ng" ? "❌ 異常" : "—";
    md += `| ${i + 1} | ${fmtT(c.tStart)} | ${MODE_LABEL[c.kind] || c.kind} | ${c.rangeName || "-"} | **${c.disp} ${c.unit}** | ${v} | ${c.source === "manual" ? "手動" : "自動"} | ${c.note || ""} |\n`;
  });
  return { md, n: rows.length, hasNg: rows.some(c => c.verdict === "ng"), hasOk: rows.some(c => c.verdict === "ok") };
}
$("btnCopyMd").addEventListener("click", async () => {
  const r = buildMdTable();
  if (!r) { toast("沒有勾選任何紀錄"); return; }
  try { await navigator.clipboard.writeText(r.md); toast(`已複製 ${r.n} 筆表格，貼到任何地方都行`); }
  catch (e) { dlBlob("dm40_measurements.md", r.md, "text/markdown"); }
});
if ($("btnAsk")) $("btnAsk").addEventListener("click", async () => {
  const r = buildMdTable();
  if (!r) { toast("沒有勾選任何紀錄"); return; }
  let tasks = "\n請幫我：\n1. 檢查有沒有明顯異常的數值\n2. 有標註測點的，判斷該數值對那個測點是否合理\n3. 給我下一步量測或判斷的建議";
  if (r.hasNg && r.hasOk) tasks = "\n表中 ✅ 是我判定正常的基準值、❌ 是有問題的量測。請幫我：\n1. 對比正常與異常的差異，分析可能的故障原因\n2. 有標註測點的，結合測點位置判斷\n3. 給我下一步量測或驗證的建議";
  else if (r.hasNg) tasks = "\n表中 ❌ 標記的是我認為有問題的量測。請幫我：\n1. 分析這些異常值可能的原因\n2. 有標註測點的，結合測點位置判斷\n3. 給我下一步量測或驗證的建議";
  const prompt = "我用 DM40C 萬用表量了以下數據：\n\n" + r.md + tasks;
  try { await navigator.clipboard.writeText(prompt); toast(`已複製 ${r.n} 筆＋分析提問，開 Claude 貼上就能問`); }
  catch (e) { dlBlob("dm40_ask_claude.md", prompt, "text/markdown"); }
});
