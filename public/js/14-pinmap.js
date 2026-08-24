"use strict";
// 14-pinmap.js — 腳位圖：SVG 是格式，生成器只是捷徑
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）
//
// 契約（四條）：
//   data-pin="N"       第 N 腳，可點、依判定上色
//   data-net="名稱"     腳位描述，會讀回資料
//   class="body|origin|notch"  裝飾，不可點
//   顏色不寫在 SVG 裡   由外部 class 控制，才能跟風格與判定連動

/* ---------- 封裝預設 ---------- */
const PKG = {
  row:  { label: "一排（FFC／排針／連接器）" },
  dual: { label: "兩排（DIP／SOIC）" },
  quad: { label: "四邊（QFP／TQFP）" },
  grid: { label: "格狀（BGA）" }
};

/* ---------- 每一腳的座標（0..1）與所在邊 ----------
   每個方向各自「正著生成」。不可用反轉陣列實作：
   反轉只有 quad 碰巧對，row/dual/grid 會亂序。 */
function pinPositions(shape, n, dir, start) {
  const P = [], k = Math.max(1, Math.round(n / 4)), sq = Math.ceil(Math.sqrt(n));
  const at = (x, y, side) => P.push({ x, y, side });
  const lerp = (a, b, i, m) => a + (b - a) * (m > 1 ? i / (m - 1) : 0.5);
  const cw = dir === "cw";
  const L = 0.20, R = 0.80, T = 0.20, B = 0.80, a = 0.31, b = 0.69;

  if (shape === "row") {
    for (let i = 0; i < n; i++)
      at(cw ? lerp(0.94, 0.06, i, n) : lerp(0.06, 0.94, i, n), 0.30, "bottom");

  } else if (shape === "dual") {
    const h = n / 2, top = (start || "bl").startsWith("t");
    const f = top ? "top" : "bottom", s2 = top ? "bottom" : "top";
    const fy = top ? 0.29 : 0.72, sy = top ? 0.72 : 0.29;
    if (!cw) {
      for (let i = 0; i < h; i++) at(lerp(0.10, 0.90, i, h), fy, f);
      for (let i = 0; i < h; i++) at(lerp(0.90, 0.10, i, h), sy, s2);
    } else {
      for (let i = 0; i < h; i++) at(lerp(0.90, 0.10, i, h), fy, f);
      for (let i = 0; i < h; i++) at(lerp(0.10, 0.90, i, h), sy, s2);
    }

  } else if (shape === "quad") {
    const run = {
      ccw: { L: () => { for (let i = 0; i < k; i++) at(L, lerp(a, b, i, k), "left"); },
             B: () => { for (let i = 0; i < k; i++) at(lerp(a, b, i, k), B, "bottom"); },
             R: () => { for (let i = 0; i < k; i++) at(R, lerp(b, a, i, k), "right"); },
             T: () => { for (let i = 0; i < k; i++) at(lerp(b, a, i, k), T, "top"); } },
      cw:  { T: () => { for (let i = 0; i < k; i++) at(lerp(a, b, i, k), T, "top"); },
             R: () => { for (let i = 0; i < k; i++) at(R, lerp(a, b, i, k), "right"); },
             B: () => { for (let i = 0; i < k; i++) at(lerp(b, a, i, k), B, "bottom"); },
             L: () => { for (let i = 0; i < k; i++) at(L, lerp(b, a, i, k), "left"); } }
    };
    // pin 1 在哪個角，就從哪一邊開始走
    const SEQ = {
      ccw: { tl: ["L","B","R","T"], bl: ["B","R","T","L"], br: ["R","T","L","B"], tr: ["T","L","B","R"] },
      cw:  { tl: ["T","R","B","L"], tr: ["R","B","L","T"], br: ["B","L","T","R"], bl: ["L","T","R","B"] }
    };
    (SEQ[cw ? "cw" : "ccw"][start || "tl"] || SEQ.ccw.tl).forEach(sd => run[cw ? "cw" : "ccw"][sd]());

  } else {
    for (let i = 0; i < n; i++)
      at(lerp(0.12, 0.88, i % sq, sq), lerp(0.12, 0.88, Math.floor(i / sq), sq), "center");
  }
  return P.slice(0, n);
}

/* ---------- 由參數生成 SVG ---------- */
function pmEsc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function pinMapSVG(shape, n, dir, start, nets) {
  const pos = pinPositions(shape, n, dir, start), big = n > 36 ? 1.25 : 1;
  const G = { row:  { W: 230, H: 118, bx: [14, 6, 202, 18] },
              dual: { W: 230, H: 190, bx: [26, 70, 178, 52] },
              quad: { W: Math.round(300 * big), H: Math.round(300 * big), bx: null },
              grid: { W: 210, H: 210, bx: [10, 10, 190, 190] } }[shape] || {};
  const W = G.W || 230, H = G.H || 118;
  const bx = G.bx || [Math.round(W * 0.28), Math.round(H * 0.28), Math.round(W * 0.44), Math.round(H * 0.44)];

  const parts = pos.map((q, i) => {
    const cx = q.x * W, cy = q.y * H, nm = pmEsc((nets && nets[i]) || "");
    const vert = q.side === "top" || q.side === "bottom";
    const w = q.side === "center" ? 9 : (vert ? 6.4 : 12);
    const h = q.side === "center" ? 9 : (vert ? 12 : 6.4);
    const rect = `<rect data-pin="${i + 1}"${nm ? ` data-net="${nm}"` : ""} x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w}" height="${h}" rx="1.4"/>`;
    const nOff = 9.5, tOff = 14;
    let nX = cx, nY = cy, mX = cx, mY = cy, rot = 0, an = "middle";
    if (q.side === "bottom") { nY = cy - nOff + 1.5; mY = cy + tOff; rot = 90; an = "start"; }
    else if (q.side === "top") { nY = cy + nOff; mY = cy - tOff; rot = -90; an = "start"; }
    else if (q.side === "left") { nX = cx + nOff + 1; nY = cy + 1.6; mX = cx - tOff; mY = cy + 1.6; an = "end"; }
    else if (q.side === "right") { nX = cx - nOff - 1; nY = cy + 1.6; mX = cx + tOff; mY = cy + 1.6; an = "start"; }
    else { nY = cy + 1.6; mY = cy + 9; }
    return rect
      + `<text data-pinlabel="${i + 1}" class="num" x="${nX.toFixed(1)}" y="${nY.toFixed(1)}">${i + 1}</text>`
      + (nm ? `<text class="net" x="${mX.toFixed(1)}" y="${mY.toFixed(1)}" text-anchor="${an}"`
            + (rot ? ` transform="rotate(${rot} ${mX.toFixed(1)} ${mY.toFixed(1)})"` : "") + `>${nm}</text>` : "");
  }).join("");

  // pin 1 原點記號：每顆晶片都有的那個點
  let mark = "";
  if (pos[0]) {
    const px = pos[0].x * W, py = pos[0].y * H;
    const inX = px < W / 2 ? bx[0] + 9 : bx[0] + bx[2] - 9;
    const inY = py < H / 2 ? bx[1] + 9 : bx[1] + bx[3] - 9;
    if (shape === "quad" || shape === "grid") mark = `<circle class="origin" cx="${inX}" cy="${inY}" r="4"/>`;
    else if (shape === "dual") mark = `<circle class="origin" cx="${px < W / 2 ? bx[0] + 10 : bx[0] + bx[2] - 10}" cy="${bx[1] + bx[3] / 2}" r="4"/>`
      + `<path class="notch" d="M ${bx[0] + bx[2] / 2 - 7} ${bx[1]} a 7 7 0 0 0 14 0"/>`;
    else mark = `<path class="notch" d="M ${px - 5} ${bx[1] + bx[3]} l 5 6 l 5 -6 z"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${shape} ${n} 腳腳位圖">`
       + `<rect class="body" x="${bx[0]}" y="${bx[1]}" width="${bx[2]}" height="${bx[3]}" rx="3"/>`
       + mark + parts + `</svg>`;
}

/* ---------- 消毒：白名單，寫入前必做 ---------- */
const SVG_TAGS = new Set(["svg","g","defs","title","desc","rect","circle","ellipse","line","polyline","polygon","path","text","tspan"]);
const SVG_ATTRS = new Set(["viewbox","width","height","x","y","x1","y1","x2","y2","cx","cy","r","rx","ry","d","points",
  "transform","class","fill","stroke","stroke-width","stroke-dasharray","stroke-linecap","stroke-linejoin","opacity",
  "fill-opacity","stroke-opacity","font-size","font-family","text-anchor","dominant-baseline",
  "data-pin","data-net","data-pinlabel","role","aria-label","preserveaspectratio"]);
function sanitizePinSVG(src) {
  const doc = new DOMParser().parseFromString(src, "image/svg+xml"), root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) return null;
  (function walk(el) {
    [...el.children].forEach(c => {
      if (!SVG_TAGS.has(c.nodeName.toLowerCase())) { c.remove(); return; }
      [...c.attributes].forEach(a => {
        const n = a.name.toLowerCase();
        if (!SVG_ATTRS.has(n) || n.startsWith("on") || n.includes("href") || /url\s*\(/i.test(a.value))
          c.removeAttribute(a.name);
      });
      walk(c);
    });
  })(root);
  [...root.attributes].forEach(a => {
    const n = a.name.toLowerCase();
    if (!SVG_ATTRS.has(n) && !n.startsWith("xmlns")) root.removeAttribute(a.name);
  });
  return root.outerHTML;
}

/* ---------- 從 SVG 讀回腳位定義（匯入用）---------- */
function pinsFromSVG(svg) {
  const tmp = document.createElement("div");
  tmp.innerHTML = svg;
  return [...tmp.querySelectorAll("[data-pin]")]
    .map(el => ({ pin: +el.getAttribute("data-pin"), net: el.getAttribute("data-net") || "" }))
    .filter(p => p.pin > 0)
    .sort((x, y) => x.pin - y.pin);
}
