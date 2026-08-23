"use strict";
// 09-sim.js — 模擬模式（無硬體時的假資料）
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ================================================================
   模擬模式
   ================================================================ */
let simTimer = null;
function stopSim() { if (simTimer) { clearInterval(simTimer); simTimer = null; } }
$("btnSim").addEventListener("click", () => {
  if (simTimer) { stopSim(); S.sim = false; setConn("err", "未連線"); toast("模擬模式已停止"); return; }
  S.sim = true; setConn("sim", "模擬模式");
  toast("模擬模式：自動產生量測數據");
  const plans = [
    { kind: "RES", targets: [9976, 21740, 470.3, 100230, 1203000] },
    { kind: "VDC", targets: [3.298, 5.012, 12.06, 1.795, 0.02251] },
    { kind: "CAP", targets: [99.7e-9, 4.63e-6, 22.9e-6] },
  ];
  let plan = plans[0], target = plan.targets[0];
  let phase = "ol", phaseLeft = 8, planIdx = 0, tgtIdx = 0;
  simTimer = setInterval(() => {
    let m;
    if (phase === "ol") {
      m = simFrame(plan.kind, null);
      if (--phaseLeft <= 0) { phase = "settle"; phaseLeft = 3 + (Math.random() * 3 | 0); }
    } else if (phase === "settle") {
      m = simFrame(plan.kind, target * (1 + (Math.random() - 0.5) * 0.2));
      if (--phaseLeft <= 0) { phase = "hold"; phaseLeft = 10 + (Math.random() * 18 | 0); }
    } else {
      m = simFrame(plan.kind, target * (1 + (Math.random() - 0.5) * 0.0015));
      if (--phaseLeft <= 0) {
        phase = "ol"; phaseLeft = 4 + (Math.random() * 8 | 0);
        tgtIdx++;
        if (tgtIdx >= plan.targets.length) { tgtIdx = 0; planIdx = (planIdx + 1) % plans.length; plan = plans[planIdx]; }
        target = plan.targets[tgtIdx];
      }
    }
    pushSample(m);
  }, 200); // 5 Hz
});
function simFrame(kind, val) {
  const m = { crcOk: true, kind, rangeName: "AUTO", batt: 4, charging: false, lock: false, hold: false, ol: val === null, value: null, disp: "OL", unit: "", dec: 2, extras: [] };
  const map = kind === "RES" ? RES_SCALE : kind === "CAP" ? CAP_SCALE : ALT_SCALE;
  let sc = null;
  if (val !== null) {
    const entries = Object.values(map).sort((a, b) => a[0] - b[0]);
    for (const e of entries) { if (Math.abs(val) <= e[0] * (kind === "CAP" ? 0.1 : 1) * 1.0001) { sc = e; break; } }
    if (!sc) sc = entries[entries.length - 1];
  } else sc = Object.values(map)[1];
  const [fs, unit, mul, dec] = sc;
  m.unit = unit; m.dec = dec; m.fsDisp = fs * mul; m.fsBase = fs;
  if (val !== null) { m.value = val; m.disp = (val * mul).toFixed(dec); }
  if (kind === "VDC") m.extras = [];
  return m;
}

$("ftSession").textContent = "session " + S.session;
window.addEventListener("beforeunload", () => { plateauFinalize(); flushSamples(true); });

if ($("btnConnect2")) $("btnConnect2").addEventListener("click", () => $("btnConnect").click());
