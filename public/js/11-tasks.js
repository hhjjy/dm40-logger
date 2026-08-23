"use strict";
// 11-tasks.js — 測點清單引導量測
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ---------- 測點清單引導量測 ---------- */
const TASK_UNITS = [["mV",1e-3,"V"],["kΩ",1e3,"Ω"],["MΩ",1e6,"Ω"],["kHz",1e3,"Hz"],["MHz",1e6,"Hz"],["mA",1e-3,"A"],["uA",1e-6,"A"],["µA",1e-6,"A"],["uF",1e-6,"F"],["µF",1e-6,"F"],["nF",1e-9,"F"],["mF",1e-3,"F"],["°C",1,"°C"],["V",1,"V"],["Ω",1,"Ω"],["Hz",1,"Hz"],["A",1,"A"]];
let TASK = { items: [], idx: 0, active: false, raw: "" };
try { const t = JSON.parse(localStorage.getItem("dm40task") || "null"); if (t && t.items) TASK = t; } catch (e) {}
function taskSave() { try { localStorage.setItem("dm40task", JSON.stringify(TASK)); } catch (e) {} }
function parseTaskText(text) {
  const items = [];
  for (let line of text.split(/\n/)) {
    line = line.trim(); if (!line) continue;
    let expect = null, unit = "", fam = null, tol = null, name = line;
    // 找「最後一個」數值+單位（名字本身常含 5V 之類字樣，預期值一定在後面）
    let best = null;
    for (const [u, mul, f] of TASK_UNITS) {
      const re = new RegExp("([-+]?\\d+(?:\\.\\d+)?)\\s*" + u + "(?![a-zA-ZΩ])", "g");
      let m;
      while ((m = re.exec(line)) !== null)
        if (!best || m.index > best.idx) best = { idx: m.index, val: parseFloat(m[1]) * mul, u, f };
    }
    if (best) {
      const pre = line.slice(0, best.idx).replace(/[,，|、\t\s]+$/, "").trim();
      if (pre) { expect = best.val; unit = best.u; fam = best.f; name = pre; }
      // pre 為空＝整行只是名字（如「5V主電源」單獨一行）→ 不設預期
    }
    const tm = line.match(/±?\s*(\d+(?:\.\d+)?)\s*%/);
    if (tm) { tol = parseFloat(tm[1]); if (name.length > tm.index) name = line.slice(0, Math.min(name.length, tm.index)); }
    if (expect !== null && tol === null) tol = 5;
    name = name.replace(/[,，|、\t\s]+$/, "").trim() || line;
    items.push({ name, expect, unit, fam, tol, disp: null, value: null, verdict: null, skipped: false });
  }
  return items;
}
function taskExpectTxt(it) {
  if (it.expect === null) return "只記錄";
  const mul = TASK_UNITS.find(u => u[0] === it.unit); 
  return "預期 " + (it.expect / (mul ? mul[1] : 1)) + " " + it.unit + " ±" + it.tol + "%";
}
function renderTaskUI() {
  const bar = $("taskBar"); if (!bar) return;
  const it = TASK.items[TASK.idx];
  if (TASK.active && it) {
    bar.style.display = "flex";
    $("taskProg").textContent = "📋 " + (TASK.idx + 1) + "/" + TASK.items.length;
    $("taskName").textContent = it.name;
    $("taskExpect").textContent = taskExpectTxt(it) + (it.fam ? " · 量 " + it.fam : "");
  } else bar.style.display = "none";
  const list = $("taskList");
  if (list) list.innerHTML = TASK.items.map((x, i) => {
    const cur = TASK.active && i === TASK.idx;
    const icon = x.verdict === "ok" ? "✅" : x.verdict === "ng" ? "❌" : x.disp ? "☑️" : x.skipped ? "⏭" : cur ? "▶" : "○";
    const res = x.disp ? ` <b style="color:${x.verdict === "ng" ? "var(--critical)" : x.verdict === "ok" ? "var(--good)" : "var(--ink1)"}">${x.disp}</b>` : "";
    return `<div style="${cur ? "color:var(--accent);font-weight:650;" : "color:var(--ink2);"}">${icon} ${x.name} <span style="color:var(--ink3);font-size:11px;">${taskExpectTxt(x)}</span>${res}</div>`;
  }).join("") || '<span style="color:var(--ink3);">尚無清單——貼上測點後按「開始任務」。可以叫 Claude 依晶片型號生成引腳量測清單。</span>';
  const st = $("taskStop"); if (st) st.style.display = TASK.active ? "" : "none";
}
function taskOnCapture(c) {
  if (!TASK.active) return;
  const it = TASK.items[TASK.idx]; if (!it) return;
  if (it.fam && BASE_UNIT[c.kind] !== it.fam) { toast("⚠ 此測點要量 " + it.fam + "，目前是 " + (BASE_UNIT[c.kind] || c.kind) + " 模式——未填入"); return; }
  it.disp = c.disp + " " + c.unit; it.value = c.value; it.skipped = false;
  if (it.expect !== null && c.value !== null)
    it.verdict = Math.abs(c.value - it.expect) <= Math.abs(it.expect) * it.tol / 100 ? "ok" : "ng";
  else it.verdict = null;
  c.note = it.name;
  c.verdict = it.verdict;
  TASK.idx++;
  if (TASK.idx >= TASK.items.length) {
    TASK.active = false;
    const ng = TASK.items.filter(x => x.verdict === "ng").length;
    setTimeout(() => toast("📋 任務完成！" + (ng ? ng + " 個測點異常" : "全部通過 ✓")), 600);
  } else if ($("ttsToggle").checked) speak({ disp: "下一點，" + TASK.items[TASK.idx].name, unit: "" });
  taskSave(); renderTaskUI();
}
if ($("btnTask")) {
  const togglePanel = () => { const p = $("taskPanel"); p.style.display = p.style.display === "block" ? "none" : "block"; if (p.style.display === "block") { $("taskText").value = TASK.raw || ""; renderTaskUI(); } };
  $("btnTask").addEventListener("click", togglePanel);
  $("taskOpen").addEventListener("click", togglePanel);
  $("taskStart").addEventListener("click", () => {
    const raw = $("taskText").value;
    const items = parseTaskText(raw);
    if (!items.length) { toast("清單是空的"); return; }
    TASK = { items, idx: 0, active: true, raw };
    taskSave(); renderTaskUI();
    $("taskPanel").style.display = "none";
    setView("measure");
    toast("📋 任務開始：" + items[0].name);
  });
  $("taskStop").addEventListener("click", () => { TASK.active = false; taskSave(); renderTaskUI(); });
  $("taskClear").addEventListener("click", () => { TASK = { items: [], idx: 0, active: false, raw: "" }; taskSave(); renderTaskUI(); $("taskText").value = ""; });
  $("taskPrev").addEventListener("click", () => { if (TASK.idx > 0) { TASK.idx--; TASK.active = true; taskSave(); renderTaskUI(); } });
  $("taskSkip").addEventListener("click", () => { const it = TASK.items[TASK.idx]; if (it && !it.disp) it.skipped = true; TASK.idx++; if (TASK.idx >= TASK.items.length) TASK.active = false; taskSave(); renderTaskUI(); });
  $("taskCopyRes").addEventListener("click", async () => {
    if (!TASK.items.length) { toast("沒有任務結果"); return; }
    let md = "## 測點量測結果（" + new Date().toLocaleString("zh-TW") + "）\n\n| 測點 | 預期 | 實測 | 判定 |\n|------|------|------|------|\n";
    for (const x of TASK.items) md += `| ${x.name} | ${x.expect !== null ? taskExpectTxt(x).replace("預期 ","") : "—"} | ${x.disp || (x.skipped ? "跳過" : "未量")} | ${x.verdict === "ok" ? "✅ 正常" : x.verdict === "ng" ? "❌ 異常" : "—"} |\n`;
    try { await navigator.clipboard.writeText(md); toast("任務結果已複製"); } catch (e) { dlBlob("dm40_task.md", md, "text/markdown"); }
  });
  renderTaskUI();
}
