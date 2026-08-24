"use strict";
// 03-capture.js — 穩定段偵測（plateau）與樣本入列
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ---------- 穩定段偵測 ---------- */
const PL = { win: [], lastKind: null, entryEvent: true, prevMed: null };
let PLATEAU_MS = 1200, REL_TOL = 0.005;
const GAP_RESET_MS = 600;
try {
  const cfg = JSON.parse(localStorage.getItem("dm40cfg") || "{}");
  if (cfg.ms) PLATEAU_MS = cfg.ms;
  if (cfg.tol) REL_TOL = cfg.tol;
} catch (e) {}
function plateauFeed(s) {
  if (s.v === null || (PL.lastKind && s.kind !== PL.lastKind)) {
    plateauFinalize(); PL.lastKind = s.kind;
    PL.entryEvent = true; PL.prevMed = null; // OL 或換模式 = 明確的重新開始
    return;
  }
  PL.lastKind = s.kind;
  let w = PL.win;
  if (w.length && s.t - w[w.length - 1].t > GAP_RESET_MS) { plateauFinalize(); w = PL.win; }
  w.push(s);
  let guard = 5000; // 保險絲：任何邊角情況都不允許鎖死 UI
  while (w.length > 2 && guard-- > 0) {
    const vals = w.map(x => x.v).sort((a, b) => a - b);
    const med = vals[vals.length >> 1];
    const tol = Math.max(Math.abs(med) * REL_TOL, 1e-12) * 2;
    if (vals[vals.length - 1] - vals[0] <= tol) break;
    if (w[w.length - 2].t - w[0].t >= PLATEAU_MS) {
      const last = w.pop();
      plateauFinalize();   // 會把 PL.win 換成新陣列
      w = PL.win;          // ★ 重新同步參考（否則切檔位時無窮迴圈）
      w.push(last);
    } else w.shift();
  }
  if (guard <= 0) { dlog("plateau 保險絲觸發，清空偵測窗"); PL.win = [s]; }
  else PL.win = w;
}
function plateauFinalize() {
  const w = PL.win;
  if (w.length >= 3 && w[w.length - 1].t - w[0].t >= PLATEAU_MS) {
    const vals = w.map(x => x.v).sort((a, b) => a - b);
    const med = vals[vals.length >> 1];
    const ref = w[w.length >> 1];
    const last = S.candidates[S.candidates.length - 1];
    const near = !(typeof TASK !== "undefined" && TASK.active) && last && last.source === "auto" && last.kind === ref.kind &&
        Math.abs(last.value - med) <= Math.max(Math.abs(med) * REL_TOL * 2, 1e-12) &&
        w[0].t - last.tEnd < 3000;
    // 進場跳變判準：穩定段必須「以跳變開場」才算一次真量測（防空接漂移連環擷取）
    const jumpTh = Math.max((ref.fsb || Math.abs(med) || 1) * 0.02, Math.abs(med) * REL_TOL * 10);
    const jumped = PL.entryEvent || PL.prevMed === null || Math.abs(med - PL.prevMed) > jumpTh;
    // 近零雜訊閘：V/A 檔在滿刻度 1.5% 以下的懸空雜散值不自動擷取
    const grp = MODE_GROUP[ref.kind];
    const junk = (grp === "V" || grp === "A") && ref.fsb && Math.abs(med) < ref.fsb * 0.015;
    if (near) {
      last.tEnd = w[w.length - 1].t; dbPut("candidates", last);
    } else if (jumped && !junk) {
      addCandidate({ tStart: w[0].t, tEnd: w[w.length - 1].t, kind: ref.kind, rangeName: ref.rangeName, unit: ref.unit, disp: ref.disp, value: med, source: "auto" });
    } else if (junk && jumped) {
      dlog("略過近零雜散值 " + ref.disp + " " + ref.unit + "（<1.5% 滿刻度）");
    }
    PL.prevMed = med; PL.entryEvent = false;
  }
  PL.win = [];
}
let actx = null;
function beep(freq, dur) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq || 1200; o.type = "sine";
    g.gain.setValueAtTime(0.06, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + (dur || 0.09));
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + (dur || 0.09));
  } catch (e) {}
}
function renderRecent() {
  const el = $("recentRow"); if (!el) return;
  el.innerHTML = S.candidates.slice(-3).reverse().map(c =>
    `<span class="recent-chip"><span class="dot2" style="background:${MODE_COLOR[MODE_GROUP[c.kind]] || "#888"}"></span><b>${c.disp} ${c.unit}</b><span>${fmtT(c.tStart)}</span><span>${c.source === "manual" ? "手動" : "自動"}</span></span>`
  ).join("");
  el.querySelectorAll(".recent-chip").forEach(x => x.addEventListener("click", () => setView("review")));
}
function addCandidate(c) {
  c.id = S.session + "-" + (++S.candSeq);
  c.session = S.session; c.note = S.ctx || ""; c.checked = true;
  taskOnCapture(c); // 任務模式：自動填入當前測點、覆寫備註與判定
  if (typeof ptOnCapture === "function") ptOnCapture(c);   // 15-pintask.js：腳位型任務
  S.candidates.push(c);
  dbPut("candidates", c);
  renderCands(); renderRecent();
  const sv = $("sbSave"); sv.classList.add("on"); setTimeout(() => sv.classList.remove("on"), 900);
  if (c.source === "auto") {
    beep(1300, 0.08);
    toast(`✓ 已記 ${c.disp} ${c.unit}（第 ${S.candidates.length} 筆）`);
  } else beep(900, 0.1);
  if ($("ttsToggle").checked && c.source === "auto") speak(c);
}
function speak(c) {
  try {
    const t = c.disp + " " + c.unit.replace("Ω", "歐姆").replace(/^u/, "微").replace(/^m(?!Ω)/, "毫").replace(/^k/, "K").replace(/^M/, "百萬").replace("°C", "度");
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "zh-TW"; u.rate = 1.15;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) {}
}

/* ---------- 樣本入列 ---------- */
let lastLiveRender = 0;
function pushSample(m, t) {
  t = t || Date.now();
  const s = { t, v: m.ol ? null : m.value, kind: m.kind, unit: m.unit, disp: m.ol ? "OL" : m.disp, rangeName: m.rangeName, fsb: m.fsBase || null };
  S.samples.push(s);
  if (S.samples.length > 120000) S.samples.splice(0, 20000);
  flushBuf.push([t, s.v, m.kind, m.disp, m.unit]); flushSamples(false);
  plateauFeed(s);
  S.pktCount++; S.rateWin.push(t);
  while (S.rateWin.length && t - S.rateWin[0] > 3000) S.rateWin.shift();
  if (t - lastLiveRender > 45) { lastLiveRender = t; renderLive(m); }
}
setInterval(() => { $("ftSamples").textContent = S.pktCount + " 筆樣本"; }, 500);
