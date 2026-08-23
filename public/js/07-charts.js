"use strict";
// 07-charts.js — 時間軸圖、迷你曲線、指針儀表
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ================================================================
   時間軸圖（DM40 螢幕風格）
   ================================================================ */
const cv = $("chart"), ctx = cv.getContext("2d");
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
let hoverX = null;
function drawChart() {
  const wrap = $("chartWrap");
  const W = wrap.clientWidth, H = wrap.clientHeight, dpr = devicePixelRatio || 1;
  if (!W || !H) { requestAnimationFrame(drawChart); return; }
  if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const padL = 58, padR = 8, padT = 8, padB = 20;
  const ARR = S.viewSamples || S.samples;   // 瀏覽歷史場次時畫歷史數據
  const now = Date.now();
  const tEnd = S.viewSamples
    ? (S.viewEnd || (ARR.length ? ARR[ARR.length - 1].t : now))
    : (S.follow ? now : (S.viewEnd || now));
  const tStart = tEnd - S.viewSpan;
  const lowerBound = t => { let lo = 0, hi = ARR.length; while (lo < hi) { const m2 = (lo + hi) >> 1; if (ARR[m2].t < t) lo = m2 + 1; else hi = m2; } return lo; };
  const inWin = ARR.slice(lowerBound(tStart - 1000), lowerBound(tEnd + 1000));
  const lastS = ARR[ARR.length - 1];
  const fam = lastS ? BASE_UNIT[lastS.kind] : null;
  const pts = inWin.filter(s => s.v !== null && BASE_UNIT[s.kind] === fam);
  let vMin = Infinity, vMax = -Infinity;
  for (const p of pts) { if (p.v < vMin) vMin = p.v; if (p.v > vMax) vMax = p.v; }
  if (!isFinite(vMin)) { vMin = 0; vMax = 1; }
  if (vMax - vMin < 1e-12) { const pad = Math.max(Math.abs(vMax) * 0.05, 1e-9); vMin -= pad; vMax += pad; }
  else { const pad = (vMax - vMin) * 0.14; const allPos = pts.length && pts.every(p => p.v >= 0); vMin -= pad; vMax += pad; if (allPos && vMin < 0) vMin = 0; }
  const X = t => padL + ((t - tStart) / (tEnd - tStart)) * (W - padL - padR);
  const Y = v => padT + (1 - (v - vMin) / (vMax - vMin)) * (H - padT - padB);

  // 點陣格線（模仿 DM40 螢幕）
  ctx.fillStyle = cssVar("--grid");
  const gx = (W - padL - padR) / 10, gy = (H - padT - padB) / 4;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 4; j++) ctx.fillRect(padL + i * gx - .5, padT + j * gy - .5, 1.5, 1.5);
  // Y 軸刻度（白字，像機器左側）
  ctx.fillStyle = cssVar("--ink2"); ctx.font = "10.5px " + cssVar("--font"); ctx.textAlign = "right";
  for (let j = 0; j <= 4; j++) {
    const v = vMax - (vMax - vMin) * j / 4;
    ctx.fillText(fmtAxis(v, fam), padL - 5, padT + j * gy + 3.5);
  }
  ctx.textAlign = "center"; ctx.fillStyle = cssVar("--ink3");
  const tickN = Math.max(2, Math.floor(W / 150));
  for (let i = 0; i <= tickN; i++) {
    const t = tStart + (tEnd - tStart) * i / tickN;
    ctx.fillText(new Date(t).toTimeString().slice(0, 8), X(t), H - 6);
  }
  // 候選段底色帶
  for (const c of (S.browse ? S.browse.cands : S.candidates)) {
    if (c.tEnd < tStart || c.tStart > tEnd) continue;
    ctx.fillStyle = c.source === "manual" ? cssVar("--band-manual") : cssVar("--band-auto");
    const x1 = Math.max(padL, X(c.tStart)), x2 = Math.min(W - padR, X(Math.max(c.tEnd, c.tStart + 200)));
    ctx.fillRect(x1, padT, Math.max(2, x2 - x1), H - padT - padB);
  }
  // 折線（橘色，像本尊）
  ctx.strokeStyle = cssVar("--data"); ctx.lineWidth = 2; ctx.lineJoin = "round";
  ctx.beginPath(); let pen = false, prevT = 0;
  for (const s of inWin) {
    if (s.v === null || BASE_UNIT[s.kind] !== fam) { pen = false; continue; }
    const x = X(s.t), y = Y(s.v);
    if (!pen || s.t - prevT > 1500) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    prevT = s.t;
  }
  ctx.stroke();
  // 手動標記線
  for (const m of S.markers) {
    if (m.t < tStart || m.t > tEnd) continue;
    ctx.strokeStyle = cssVar("--mark"); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(m.t), padT); ctx.lineTo(X(m.t), H - padB); ctx.stroke(); ctx.setLineDash([]);
  }
  // MAX/MIN/REL 統計欄
  if (pts.length) {
    const rawMax = Math.max(...pts.map(p => p.v)), rawMin = Math.min(...pts.map(p => p.v));
    $("stMax").textContent = fmtAxis(rawMax, fam) + (fam || "");
    $("stMin").textContent = fmtAxis(rawMin, fam) + (fam || "");
    $("stRel").textContent = fmtAxis(rawMax - rawMin, fam) + (fam || "");
  }
  // hover crosshair
  if (hoverX !== null && pts.length) {
    const tH = tStart + ((hoverX - padL) / (W - padL - padR)) * (tEnd - tStart);
    let best = null, bd = Infinity;
    for (const p of pts) { const d = Math.abs(p.t - tH); if (d < bd) { bd = d; best = p; } }
    if (best && bd < 3000) {
      ctx.strokeStyle = cssVar("--ink3"); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(best.t), padT); ctx.lineTo(X(best.t), H - padB); ctx.stroke();
      ctx.fillStyle = cssVar("--data");
      ctx.beginPath(); ctx.arc(X(best.t), Y(best.v), 4.5, 0, 7); ctx.fill();
      ctx.strokeStyle = cssVar("--surface"); ctx.lineWidth = 2; ctx.stroke();
      const tip = $("tooltip");
      tip.style.display = "block";
      tip.innerHTML = `<div class="t">${fmtT(best.t)}</div><b>${best.disp} ${best.unit}</b>`;
      tip.style.left = Math.min(X(best.t) + 12, W - 120) + "px";
      tip.style.top = Math.max(4, Y(best.v) - 42) + "px";
    } else $("tooltip").style.display = "none";
  } else $("tooltip").style.display = "none";
  requestAnimationFrame(drawChart);
}
function fmtAxis(v, fam) {
  if (fam === "F") { if (Math.abs(v) < 1e-6) return (v * 1e9).toPrecision(3) + "n"; if (Math.abs(v) < 1e-3) return (v * 1e6).toPrecision(3) + "u"; return (v * 1e3).toPrecision(3) + "m"; }
  const av = Math.abs(v);
  if (av >= 1e6) return (v / 1e6).toPrecision(4) + "M";
  if (av >= 1e3) return (v / 1e3).toPrecision(4) + "k";
  if (av < 1e-3 && av > 0) return (v * 1e6).toPrecision(3) + "u";
  if (av < 0.1 && av > 0) return (v * 1e3).toPrecision(4) + "m";
  return v.toPrecision(5);
}
requestAnimationFrame(drawChart);

/* ---------- 量測頁小工具：迷你曲線 / 指針儀表 ---------- */
function drawSpark() {
  const sc = $("spark");
  if (!sc || sc.offsetParent === null) { requestAnimationFrame(drawSpark); return; }
  const W = sc.clientWidth, H = sc.clientHeight, dpr = devicePixelRatio || 1;
  if (!W || !H) { requestAnimationFrame(drawSpark); return; }
  if (sc.width !== W * dpr || sc.height !== H * dpr) { sc.width = W * dpr; sc.height = H * dpr; }
  const c2 = sc.getContext("2d");
  c2.setTransform(dpr, 0, 0, dpr, 0, 0);
  c2.clearRect(0, 0, W, H);
  if (S.widget === "gauge") { drawGauge(c2, W, H); requestAnimationFrame(drawSpark); return; }
  const now = Date.now(), t0 = now - 30e3;
  const lastS = S.samples[S.samples.length - 1];
  if (!lastS) { requestAnimationFrame(drawSpark); return; }
  const fam = BASE_UNIT[lastS.kind];
  let i = S.samples.length - 1;
  while (i > 0 && S.samples[i].t > t0) i--;
  const pts = S.samples.slice(i).filter(s => s.v !== null && BASE_UNIT[s.kind] === fam);
  if (pts.length > 1) {
    let vMin = Infinity, vMax = -Infinity;
    for (const p of pts) { if (p.v < vMin) vMin = p.v; if (p.v > vMax) vMax = p.v; }
    if (vMax - vMin < 1e-12) { const pad = Math.max(Math.abs(vMax) * .05, 1e-9); vMin -= pad; vMax += pad; }
    else { const pad = (vMax - vMin) * .15; vMin -= pad; vMax += pad; }
    c2.strokeStyle = cssVar("--grid"); c2.setLineDash([3, 4]); c2.lineWidth = 1;
    c2.beginPath(); c2.moveTo(0, H / 2); c2.lineTo(W, H / 2); c2.stroke(); c2.setLineDash([]);
    c2.strokeStyle = cssVar("--data"); c2.lineWidth = 2; c2.lineJoin = "round";
    c2.beginPath(); let pen = false, prevT = 0;
    for (const p of pts) {
      const x = ((p.t - t0) / 30e3) * W, y = 4 + (1 - (p.v - vMin) / (vMax - vMin)) * (H - 8);
      if (!pen || p.t - prevT > 1500) { c2.moveTo(x, y); pen = true; } else c2.lineTo(x, y);
      prevT = p.t;
    }
    c2.stroke();
  }
  requestAnimationFrame(drawSpark);
}
function drawGauge(c2, W, H) {
  const m = S.lastM;
  const col = m ? (MODE_COLOR[MODE_GROUP[m.kind]] || "#4c9aff") : cssVar("--ink3");
  const cx = W / 2, cy = H * 0.62, R = Math.min(W / 2.6, H * 0.56);
  const a0 = Math.PI * 0.75, sweep = Math.PI * 1.5;
  // 背景弧
  c2.lineCap = "round";
  c2.strokeStyle = cssVar("--grid"); c2.lineWidth = 10;
  c2.beginPath(); c2.arc(cx, cy, R, a0, a0 + sweep); c2.stroke();
  let frac = 0, olPegged = false, fsDisp = m && m.fsDisp ? m.fsDisp : null;
  if (m && fsDisp) {
    if (m.ol) { frac = 1; olPegged = true; }
    else if (m.value !== null) frac = Math.min(1, Math.abs(parseFloat(m.disp)) / fsDisp);
  }
  // 數值弧
  c2.strokeStyle = olPegged ? cssVar("--critical") : col;
  c2.beginPath(); c2.arc(cx, cy, R, a0, a0 + sweep * Math.max(0.003, frac)); c2.stroke();
  // 刻度
  c2.lineWidth = 1.6; c2.strokeStyle = cssVar("--ink3");
  c2.fillStyle = cssVar("--ink3"); c2.font = "10.5px " + cssVar("--font"); c2.textAlign = "center";
  for (let i = 0; i <= 10; i++) {
    const a = a0 + sweep * i / 10;
    const x1 = cx + Math.cos(a) * (R - 14), y1 = cy + Math.sin(a) * (R - 14);
    const x2 = cx + Math.cos(a) * (R - 20 - (i % 5 === 0 ? 4 : 0)), y2 = cy + Math.sin(a) * (R - 20 - (i % 5 === 0 ? 4 : 0));
    c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke();
    if (fsDisp && i % 5 === 0) {
      const lx = cx + Math.cos(a) * (R - 36), ly = cy + Math.sin(a) * (R - 36) + 3.5;
      c2.fillText((fsDisp * i / 10).toPrecision(3).replace(/\.?0+$/, ""), lx, ly);
    }
  }
  // 指針
  const na = a0 + sweep * frac;
  c2.strokeStyle = olPegged ? cssVar("--critical") : col; c2.lineWidth = 3;
  c2.beginPath(); c2.moveTo(cx - Math.cos(na) * 14, cy - Math.sin(na) * 14);
  c2.lineTo(cx + Math.cos(na) * (R - 26), cy + Math.sin(na) * (R - 26)); c2.stroke();
  c2.fillStyle = col; c2.beginPath(); c2.arc(cx, cy, 6, 0, 7); c2.fill();
  // 檔位滿刻度標示
  c2.fillStyle = cssVar("--ink3"); c2.font = "11.5px " + cssVar("--font"); c2.textAlign = "center";
  if (m && fsDisp) c2.fillText("滿刻度 " + fsDisp.toPrecision(4).replace(/\.?0+$/, "") + " " + m.unit + (m.rangeName && m.rangeName.startsWith("AUTO") ? "（AUTO）" : ""), cx, cy + R * 0.52);
}
requestAnimationFrame(drawSpark);

$("chartWrap").addEventListener("wheel", e => {
  e.preventDefault();
  const f = e.deltaY > 0 ? 1.25 : 0.8;
  S.viewSpan = Math.min(15 * 60e3, Math.max(5e3, S.viewSpan * f));
}, { passive: false });
let dragT0 = null;
$("chartWrap").addEventListener("pointerdown", e => { dragT0 = { x: e.clientX, end: S.viewEnd || Date.now() }; });
window.addEventListener("pointermove", e => {
  const wrap = $("chartWrap"), r = wrap.getBoundingClientRect();
  hoverX = (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) ? e.clientX - r.left : null;
  if (dragT0 && Math.abs(e.clientX - dragT0.x) > 4) {
    S.follow = false; $("btnFollow").style.display = "block";
    const dx = e.clientX - dragT0.x;
    S.viewEnd = dragT0.end + (dx / wrap.clientWidth) * -S.viewSpan;
  }
});
window.addEventListener("pointerup", () => dragT0 = null);
$("btnFollow").addEventListener("click", () => { S.follow = true; S.viewEnd = null; $("btnFollow").style.display = "none"; });
