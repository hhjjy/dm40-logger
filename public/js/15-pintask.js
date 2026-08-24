"use strict";
// 15-pintask.js — 腳位型任務：兩種量測（建基準／比對）、左圖右表、手改／OL／記完不跳
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ══════════ 狀態 ══════════
   PT.kind  gold    建立黃金標準——沒有基準可比，只記錄
            compare 拿基準比對——顯示差異與判定
   模式由任務決定：有 baseline 就是 compare。 */
const PT = {
  on: false, kind: "compare", idx: 0,
  comp: { board: "", ref: "J5", name: "連接器" },
  pkg:  { shape: "row", pins: 14, dir: "ccw", start: "tl" },
  flip: false, autoAdvance: false, tolPct: 12,
  baseline: "", points: []          // {pin, net, expect|null, value, flag, skipped, edited}
};
try { const t = JSON.parse(localStorage.getItem("dm40pintask") || "null"); if (t && t.points) Object.assign(PT, t); } catch (e) {}
function ptSave() { try { localStorage.setItem("dm40pintask", JSON.stringify(PT)); } catch (e) {} }

// 名稱是使用者打的字，進 innerHTML 前一律跳脫
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const ptGold = () => PT.kind === "gold";
function ptVerdict(p) {
  if (p.skipped) return "sk";
  if (p.value === null && !p.flag) return "pend";
  if (ptGold()) return "rec";                       // 建基準：沒有對錯，只有記到了
  if (p.expect === null || p.expect === undefined) return "rec";
  if (p.expect === "OL") return p.flag === "OL" ? "ok" : "ng";
  if (p.flag === "OL") return "ng";
  return Math.abs(p.value - p.expect) <= Math.max(Math.abs(p.expect) * PT.tolPct / 100, 0.03) ? "ok" : "ng";
}
const ptShown = p => p.flag || (p.value === null ? "—" : String(p.value));
const ptExp = p => (p.expect === null || p.expect === undefined) ? "—" : (p.expect === "OL" ? "OL" : String(p.expect));
const ptDone = () => PT.points.filter(p => ptVerdict(p) !== "pend").length;
const ptBad  = () => PT.points.filter(p => ptVerdict(p) === "ng");

/* ══════════ 建立任務 ══════════ */
function ptStart(kind, comp, pkg, nets, expects, baseline) {
  PT.on = true; PT.kind = kind; PT.idx = 0;
  Object.assign(PT.comp, comp); Object.assign(PT.pkg, pkg);
  PT.baseline = baseline || "";
  PT.points = Array.from({ length: pkg.pins }, (_, i) => ({
    pin: i + 1, net: (nets && nets[i]) || "",
    expect: (kind === "compare" && expects && expects[i] !== undefined) ? expects[i] : null,
    value: null, flag: null, skipped: null, edited: false
  }));
  ptSave(); ptRender();
  if (typeof setView === "function") setView("measure");
  if (typeof toast === "function") toast(kind === "gold" ? "開始建立黃金標準" : "開始比對");
}
function ptStop() { PT.on = false; ptSave(); ptRender(); }

/* ══════════ 擷取時填入（由 addCandidate 呼叫）══════════ */
function ptOnCapture(c) {
  if (!PT.on) return;
  const p = PT.points[PT.idx]; if (!p) return;
  const bad = (c.value === null || c.value === undefined || Number.isNaN(c.value));
  p.value = bad ? null : +Number(c.value).toPrecision(6);
  p.flag = bad ? "OL" : null;
  p.skipped = null; p.edited = false;
  c.note = PT.comp.ref + " pin " + p.pin + (p.net ? " " + p.net : "");
  c.verdict = ptGold() ? null : ptVerdict(p);
  if (PT.autoAdvance) ptNext();                     // 預設關閉：記完停在原地
  ptSave(); ptRender();
}
function ptNext() {
  let n = PT.idx + 1;
  while (n < PT.points.length && ptVerdict(PT.points[n]) !== "pend") n++;
  PT.idx = Math.min(n, PT.points.length - 1);
}
function ptPick(i) { PT.idx = i; ptRender(); }
function ptSetVal(i, v) {
  const t = String(v).trim().toUpperCase(), p = PT.points[i];
  if (t === "OL" || t === "開路") { p.flag = "OL"; p.value = null; }
  else { const n = parseFloat(t); if (isNaN(n)) return; p.value = n; p.flag = null; }
  p.skipped = null; p.edited = true; ptSave(); ptRender();
}
function ptOL(i)    { const p = PT.points[i]; p.flag = "OL"; p.value = null; p.skipped = null; p.edited = true; ptSave(); ptRender(); }
function ptSkip(i)  { const p = PT.points[i]; p.skipped = "構不到"; p.value = null; p.flag = null; ptSave(); ptRender(); }
function ptClear(i) { const p = PT.points[i]; p.value = null; p.flag = null; p.skipped = null; p.edited = false; ptSave(); ptRender(); }

/* ══════════ 畫面 ══════════ */
function ptRender() {
  const split = $("taskSplit"), flow = $("taskFlow");
  if (!split || !flow) return;
  split.classList.toggle("on", PT.on);
  flow.classList.toggle("on", PT.on);
  if (!PT.on) return;

  const gold = ptGold(), n = PT.points.length, d = ptDone(), b = ptBad().length;

  const steps = gold
    ? [["選元件・量法", esc(PT.comp.ref) + " " + PT.pkg.pins + " 腳", "done"],
       ["量好板", d + " / " + n, d >= n ? "done" : "now"],
       ["確認", d < n ? "—" : "可存為基準", d < n ? "" : "now"],
       ["存成黃金標準", d < n ? "—" : "按這裡 →", d < n ? "" : "now"]]
    : [["選元件・量法", esc(PT.comp.ref) + " " + PT.pkg.pins + " 腳", "done"],
       ["量待修板", d + " / " + n, d >= n ? "done" : "now"],
       ["比對", d < n ? "—" : (b ? b + " 個異常" : "全部相符"), d < n ? "" : (b ? "warn" : "now")],
       ["上傳", "—", ""]];
  flow.innerHTML = steps.map(x => '<div class="st ' + x[2] + '"><b>' + x[0] + '</b><s>' + x[1] + '</s></div>').join("")
    + (gold && d >= n ? '<button class="primary" style="font-size:12px;margin:4px" onclick="ptSaveBaseline()">存成基準</button>' : "");

  $("tsLeftTitle").textContent = gold ? "量好板（建立基準）" : "量待修板";
  $("tsRightTitle").innerHTML = gold
    ? '建立中的基準<span class="badge gold">● 黃金標準</span>'
    : '與基準比對<span class="badge cmp">● ' + esc(PT.baseline || "基準") + '</span>';

  const startOpts = [["tl", "第一腳 左上"], ["bl", "第一腳 左下"], ["br", "第一腳 右下"], ["tr", "第一腳 右上"]];
  $("pmBar").innerHTML = '<div class="pmBar">'
    + '<select onchange="PT.pkg.shape=this.value;ptSave();ptRender()">'
    + Object.keys(PKG).map(k => '<option value="' + k + '"' + (k === PT.pkg.shape ? " selected" : "") + '>' + PKG[k].label + '</option>').join("")
    + '</select>'
    + '<select onchange="PT.pkg.dir=this.value;ptSave();ptRender()">'
    + '<option value="ccw"' + (PT.pkg.dir === "ccw" ? " selected" : "") + '>逆時針（標準）</option>'
    + '<option value="cw"' + (PT.pkg.dir === "cw" ? " selected" : "") + '>順時針</option></select>'
    + ((PT.pkg.shape === "quad" || PT.pkg.shape === "dual")
       ? '<select onchange="PT.pkg.start=this.value;ptSave();ptRender()">'
         + startOpts.filter(o => PT.pkg.shape === "quad" || o[0][0] === "t" || o[0] === "bl")
           .map(o => '<option value="' + o[0] + '"' + (PT.pkg.start === o[0] ? " selected" : "") + '>' + o[1] + '</option>').join("")
         + '</select>' : "")
    + '<button class="ghost" style="font-size:11px;padding:4px 9px" onclick="PT.flip=!PT.flip;ptSave();ptRender()">'
    + (PT.flip ? "● 看焊接面" : "○ 看正面") + '</button>'
    + '<button class="ghost" style="font-size:11px;padding:4px 9px" onclick="PT.autoAdvance=!PT.autoAdvance;ptSave();ptRender()">'
    + (PT.autoAdvance ? "● 記完跳下一腳" : "○ 記完停著") + '</button>'
    + '<button class="ghost" style="font-size:11px;padding:4px 9px;color:var(--critical)" onclick="ptStop()">結束</button>'
    + '</div>';

  const wrap = $("pmSvg");
  wrap.className = "pmSvg" + (PT.flip ? " flip" : "");
  wrap.innerHTML = pinMapSVG(PT.pkg.shape, PT.pkg.pins, PT.pkg.dir, PT.pkg.start, PT.points.map(p => p.net));
  wrap.querySelectorAll("[data-pin]").forEach(el => {
    const i = +el.getAttribute("data-pin") - 1, p = PT.points[i]; if (!p) return;
    const v = ptVerdict(p);
    // 判定管顏色、now 只加光暈——正在量的那腳若異常，仍然看得到紅色
    const vc = (v === "ok" || v === "rec") ? "ok" : v === "ng" ? "ng" : v === "sk" ? "sk" : "pend";
    el.setAttribute("class", vc + (i === PT.idx ? " now" : "") + (i === 0 ? " p1" : ""));
    el.addEventListener("click", () => ptPick(i));
    const ti = document.createElementNS("http://www.w3.org/2000/svg", "title");
    ti.textContent = "pin " + p.pin + "　" + p.net; el.appendChild(ti);
  });
  wrap.querySelectorAll("[data-pinlabel]").forEach(el => {
    const i = +el.getAttribute("data-pinlabel") - 1;
    const vv = ptVerdict(PT.points[i]);
    const st = (vv === "ng" ? "ng" : "") + (i === PT.idx ? " now" : "");
    el.setAttribute("class", "num " + st);
    const nx = el.nextElementSibling;
    if (nx && (nx.getAttribute("class") || "").indexOf("net") === 0) nx.setAttribute("class", "net " + st);
  });
  const leg = gold ? [["good", "已記錄"]] : [["good", "相符"], ["critical", "異常"]];
  $("pmLegend").innerHTML = leg.concat([["warning", "跳過"]])
    .map(x => '<span><i style="background:var(--' + x[0] + ')"></i>' + x[1] + '</span>').join("")
    + '<span><i style="background:var(--surface2);border:1px solid var(--border)"></i>還沒量</span>';

  const cur = PT.points[PT.idx];
  $("tsEdit").innerHTML = '<b style="font-size:12.5px">pin ' + cur.pin + '</b>'
    + '<span style="font-size:12px;color:var(--ink2)">' + esc(cur.net) + '</span>'
    + '<input id="tsInp" value="' + esc(cur.flag || (cur.value === null ? "" : cur.value)) + '" placeholder="量到的數值，或直接打 OL" inputmode="decimal">'
    + '<button class="ghost" onclick="ptOL(' + PT.idx + ')">開路 OL</button>'
    + '<button class="ghost" onclick="ptSkip(' + PT.idx + ')">跳過</button>'
    + '<button class="ghost" onclick="ptClear(' + PT.idx + ')">清掉</button>';
  const inp = $("tsInp");
  inp.addEventListener("keydown", e => { if (e.key === "Enter") ptSetVal(PT.idx, inp.value); });
  inp.addEventListener("blur", () => { if (inp.value !== "") ptSetVal(PT.idx, inp.value); });

  $("tsHead").innerHTML = gold
    ? "<th>PIN</th><th>網路</th><th>量到</th><th>狀態</th>"
    : "<th>PIN</th><th>網路</th><th>基準</th><th>量到</th><th>差</th><th>判定</th>";
  $("tsBody").innerHTML = PT.points.map((p, i) => {
    const v = ptVerdict(p);
    const dd = (!gold && p.value !== null && typeof p.expect === "number")
      ? ((p.value - p.expect >= 0 ? "+" : "") + (p.value - p.expect).toFixed(3)) : "";
    const val = '<td class="n"><b>' + esc(ptShown(p)) + '</b>'
      + (p.edited ? ' <span style="color:var(--warning);font-size:9.5px">手改</span>' : "") + '</td>';
    const st = '<td><span class="tsVd ' + v + '">'
      + (v === "rec" ? "● 已記錄" : v === "ok" ? "✓" : v === "ng" ? "✗ 異常" : v === "sk" ? "跳過" : "—") + '</span></td>';
    return '<tr class="' + (i === PT.idx ? "cur" : "") + " " + (v === "ng" ? "ng" : "") + '" onclick="ptPick(' + i + ')">'
      + '<td class="n">' + p.pin + '</td><td>' + esc(p.net) + '</td>'
      + (gold ? val + st
              : '<td class="n" style="color:var(--ink3)">' + esc(ptExp(p)) + '</td>' + val
                + '<td class="n" style="color:var(--ink3)">' + dd + '</td>' + st)
      + '</tr>';
  }).join("");
}

ptRender();

/* ══════════ 基準庫（本機版，之後換成 D1）══════════ */
function ptBaseKey(ref, shape, pins) { return ref + "|" + shape + "|" + pins; }
function ptBaselines() {
  try { return JSON.parse(localStorage.getItem("dm40baselines") || "{}"); } catch (e) { return {}; }
}
function ptSaveBaseline() {
  if (!PT.on || !ptGold()) { toast("只有『建立黃金標準』的任務可以存成基準"); return; }
  const measured = PT.points.filter(p => p.value !== null || p.flag);
  if (!measured.length) { toast("還沒量到任何一腳"); return; }
  const all = ptBaselines();
  all[ptBaseKey(PT.comp.ref, PT.pkg.shape, PT.pkg.pins)] = {
    ref: PT.comp.ref, pkg: { ...PT.pkg }, savedAt: new Date().toISOString(),
    points: PT.points.map(p => ({ pin: p.pin, net: p.net, value: p.value, flag: p.flag }))
  };
  try { localStorage.setItem("dm40baselines", JSON.stringify(all)); } catch (e) {}
  toast("已存為基準：" + PT.comp.ref + "（" + measured.length + " 腳）");
  ptFillBaseSelect();
}

/* ══════════ 任務建立介面 ══════════ */
function ptFillBaseSelect() {
  const sel = $("ptBase"); if (!sel) return;
  const all = ptBaselines(), keys = Object.keys(all);
  sel.innerHTML = keys.length
    ? keys.map(k => '<option value="' + esc(k) + '">' + esc(all[k].ref) + " · " + all[k].pkg.pins + " 腳</option>").join("")
    : '<option value="">（還沒有基準）</option>';
}
function ptReadForm() {
  const shape = $("ptShape").value;
  const pins = Math.max(2, Math.min(256, +$("ptPins").value || 14));
  const nets = $("ptNets").value.split(/\n/).map(x => x.trim());
  return { ref: $("ptRef").value.trim() || "J5", shape, pins, nets };
}
if ($("ptGoGold")) {
  const sh = $("ptShape");
  sh.innerHTML = Object.keys(PKG).map(k => '<option value="' + k + '">' + PKG[k].label + "</option>").join("");
  sh.value = PT.pkg.shape;
  ptFillBaseSelect();

  $("ptGoGold").addEventListener("click", () => {
    const f = ptReadForm();
    ptStart("gold", { ref: f.ref }, { shape: f.shape, pins: f.pins, dir: PT.pkg.dir, start: PT.pkg.start }, f.nets, null, "");
    $("taskPanel").style.display = "none";
  });

  $("ptGoCmp").addEventListener("click", () => {
    const key = $("ptBase").value;
    const base = ptBaselines()[key];
    if (!base) { toast("請先建立一份基準"); return; }
    const f = ptReadForm();
    const nets = base.points.map(p => p.net);
    const expects = base.points.map(p => p.flag === "OL" ? "OL" : p.value);
    ptStart("compare", { ref: base.ref }, { ...base.pkg }, nets, expects, base.ref + " 基準");
    $("taskPanel").style.display = "none";
  });
}
