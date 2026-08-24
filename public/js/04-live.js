"use strict";
// 04-live.js — 即時面板、手動標記、候選清單
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ---------- 即時面板（電表螢幕） ---------- */
function renderLive(m) {
  $("sbRange").textContent = m.rangeName || "AUTO";
  $("modeChip").textContent = MODE_LABEL[m.kind] || m.kind;
  $("tagHold").style.display = m.hold ? "" : "none";
  const hv = $("heroVal");
  if (m.ol) { hv.textContent = "OL"; hv.classList.add("ol"); }
  else { hv.textContent = m.disp; hv.classList.remove("ol"); }
  $("heroUnit").textContent = m.unit;
  $("heroAcdc").textContent = ACDC_MARK[m.kind] || "";
  $("subrow").innerHTML = m.extras.map(e =>
    `<span class="sub-chip${e[0] === "OL" ? " ol" : ""}">${e[2] ? `<span class="sub-label">${e[2]}</span>` : ""}<b>${e[0]}</b><span class="sub-unit">${e[1]}</span></span>`
  ).join("");
  $("battFill").style.width = Math.min(100, (m.batt / 5) * 100) + "%";
  const rate = S.rateWin.length > 1 ? ((S.rateWin.length - 1) / ((S.rateWin[S.rateWin.length - 1] - S.rateWin[0]) / 1000)) : 0;
  $("stRate").textContent = rate.toFixed(1) + " Hz";
  // 模式指示：模式帶點亮 + 全域模式色（大數字/單位/曲線跟著變色）
  S.lastM = m;
  const g = MODE_GROUP[m.kind];
  document.querySelectorAll(".mbtn, .modestrip .seg").forEach(el => el.classList.toggle("active", el.dataset.g === g));
  const mc = MODE_COLOR[g];
  if (mc) {
    const hc = $("heroCard"); if (hc) hc.style.setProperty("--modecol", mc);
    document.documentElement.style.setProperty("--data", mc);
  }
  const idle = $("heroIdle"); if (idle) idle.style.display = "none";
  if (S.crcFail) $("ftCrc").innerHTML = `<span class="warn">CRC 失敗 ${S.crcFail}</span>`;
}

/* ---------- 手動標記 ---------- */
function doMark() {
  const last = [...S.samples].reverse().find(x => x.v !== null) || S.samples[S.samples.length - 1];
  if (!last) { toast("還沒有數據可標記"); return; }
  addCandidate({ tStart: last.t, tEnd: last.t, kind: last.kind, rangeName: last.rangeName, unit: last.unit || "", disp: last.disp, value: last.v ?? NaN, source: "manual" });
  S.markers.push({ t: last.t });
  $("btnMark").classList.remove("flash"); void $("btnMark").offsetWidth; $("btnMark").classList.add("flash");
  toast("已標記 ✚ " + last.disp + " " + (last.unit || ""));
}
$("btnMark").addEventListener("click", doMark);
document.addEventListener("keydown", e => {
  if (e.code === "Space" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) { e.preventDefault(); doMark(); }
});

/* ---------- 候選清單 ---------- */
function renderCands() {
  const tb = $("candBody");
  const list = displayedCands();
  $("emptyHint").style.display = list.length ? "none" : "";
  $("candCount").textContent = list.length + " 筆" + (S.browse ? "（歷史場次）" : "");
  const badge = $("candBadge"); if (badge) badge.textContent = S.candidates.length;
  tb.innerHTML = "";
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    const tr = document.createElement("tr");
    if (c.checked) tr.classList.add("selrow");
    tr.innerHTML = `
      <td><input type="checkbox" ${c.checked ? "checked" : ""}></td>
      <td style="color:var(--ink-3)">${i + 1}</td>
      <td class="time-cell">${fmtT(c.tStart)}</td>
      <td class="mode-cell">${MODE_LABEL[c.kind] || c.kind}<br><span class="src ${c.source === "manual" ? "manual" : ""}">${c.source === "manual" ? "手動" : "自動"}</span></td>
      <td class="val-cell">${c.disp}<span class="unit-sm">${c.unit}</span></td>
      <td><button class="vbtn ${c.verdict || ""}" title="點擊循環：未標 → 正常 → 異常">${c.verdict === "ok" ? "✓ 正常" : c.verdict === "ng" ? "✗ 異常" : "─"}</button></td>
      <td><input type="text" placeholder="例如 C301 對地" value="${(c.note || "").replace(/"/g, "&quot;")}"></td>
      <td><button class="snapbtn" title="複製快照圖卡（含當時波形）"><svg class="lucide" viewBox="0 0 24 24" style="width:14px;height:14px;"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg></button></td>`;
    tr.querySelector('input[type="checkbox"]').addEventListener("change", e => { c.checked = e.target.checked; dbPut("candidates", c); tr.classList.toggle("selrow", c.checked); });
    tr.querySelector('input[type="text"]').addEventListener("change", e => { c.note = e.target.value; dbPut("candidates", c); renderDetail(); });
    tr.querySelector(".snapbtn").addEventListener("click", e => { e.stopPropagation(); copySnapshot(c); });
    tr.querySelector(".vbtn").addEventListener("click", e => {
      e.stopPropagation();
      c.verdict = c.verdict === "ok" ? "ng" : c.verdict === "ng" ? null : "ok";
      dbPut("candidates", c);
      const b = e.currentTarget;
      b.className = "vbtn " + (c.verdict || "");
      b.textContent = c.verdict === "ok" ? "✓ 正常" : c.verdict === "ng" ? "✗ 異常" : "─";
      renderDetail();
    });
    tr.addEventListener("click", e => {
      if (e.target.tagName === "INPUT" || e.target.closest(".snapbtn") || e.target.closest(".vbtn")) return;
      S.selected = c; renderDetail();
      S.follow = false; $("btnFollow").style.display = S.browse ? "none" : "block";
      S.viewEnd = c.tEnd + S.viewSpan * 0.3;
      if (document.body.dataset.view !== "review") setView("review");
    });
    tb.appendChild(tr);
  }
  renderDetail();
}
