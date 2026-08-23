"use strict";
// 01-protocol.js — DM40 BLE 協議：常數、旗標表、parseFrame（移植自 maj113/DM40GUI, MIT）
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ================================================================
   DM40 BLE 協議（移植自 maj113/DM40GUI, MIT License）
   ================================================================ */
const BLE_SERVICE = 0xfff0, BLE_NOTIFY = 0xfff1, BLE_WRITE = 0xfff3;
const HEADER = [0xDF, 0x05, 0x03, 0x09];
const CMD_ID   = new Uint8Array([0xAF, 0x05, 0x03, 0x08, 0x00, 0x41]); // 初始化/詢問機型
const CMD_READ = new Uint8Array([0xAF, 0x05, 0x03, 0x09, 0x00, 0x40]); // 討一包量測值
const DEVICE_COUNTS = 60000; // DM40C

const FLAG_INFO = {
  0x00:["VDC","600mV"],0x08:["VDC","6V"],0x10:["VDC","60V"],0x18:["VDC","600V"],0x20:["VDC","1000V"],0x28:["VDC","AUTO"],0x30:["VDC","AUTO+"],
  0x40:["VAC","600mV"],0x48:["VAC","6V"],0x50:["VAC","60V"],0x58:["VAC","600V"],0x60:["VAC","1000V"],0x68:["VAC","AUTO"],0x70:["VAC","AUTO+"],
  0x80:["VDC+AC","600mV"],0x88:["VDC+AC","6V"],0x90:["VDC+AC","60V"],0x98:["VDC+AC","600V"],0xA0:["VDC+AC","1000V"],0xA8:["VDC+AC","AUTO"],0xB0:["VDC+AC","AUTO+"],
  0x01:["ADC","600uA"],0x09:["ADC","6mA"],0x11:["ADC","60mA"],0x19:["ADC","600mA"],0x21:["ADC","6A"],0x29:["ADC","10A"],0x31:["ADC","AUTO"],0x39:["ADC","AUTO+"],
  0x41:["AAC","600uA"],0x49:["AAC","6mA"],0x51:["AAC","60mA"],0x59:["AAC","600mA"],0x61:["AAC","6A"],0x69:["AAC","10A"],0x71:["AAC","AUTO"],0x79:["AAC","AUTO+"],
  0x81:["ADC+AC","600uA"],0x89:["ADC+AC","6mA"],0x91:["ADC+AC","60mA"],0x99:["ADC+AC","600mA"],0xA1:["ADC+AC","6A"],0xA9:["ADC+AC","10A"],0xB1:["ADC+AC","AUTO"],0xB9:["ADC+AC","AUTO+"],
  0x02:["RES","600Ω"],0x0A:["RES","6kΩ"],0x12:["RES","60kΩ"],0x1A:["RES","600kΩ"],0x22:["RES","6MΩ"],0x2A:["RES","60MΩ"],0x32:["RES","AUTO"],
  0x42:["RES_ONLINE","600Ω"],0x4A:["RES_ONLINE","6kΩ"],0x52:["RES_ONLINE","60kΩ"],0x5A:["RES_ONLINE","600kΩ"],0x62:["RES_ONLINE","6MΩ"],0x6A:["RES_ONLINE","60MΩ"],0x72:["RES_ONLINE","AUTO"],
  0x03:["CAP","AUTO"],0x04:["DIODE","AUTO"],0x44:["CONT","AUTO"],0x05:["FREQ","AUTO"],0x45:["TEMP","AUTO"]
};
// [full_scale, unit, mul, decimals]
const ALT_SCALE  = {0x04:[0.6,"mV",1e3,2],0x08:[6,"V",1,4],0x18:[6,"V",1,4],0x16:[60,"V",1,3],0x14:[600,"V",1,2],0x12:[6000,"V",1,1]};
const AMP_SCALE  = {0x04:[600e-6,"uA",1e6,2],0x02:[6000e-6,"uA",1e6,1],0x16:[60e-3,"mA",1e3,3],0x14:[600e-3,"mA",1e3,2],0x28:[6,"A",1,4],0x26:[60,"A",1,3]};
const RES_SCALE  = {0x04:[600,"Ω",1,2],0x02:[6000,"Ω",1,1],0x18:[6000,"kΩ",1e-3,4],0x16:[60000,"kΩ",1e-3,3],0x14:[600000,"kΩ",1e-3,2],0x28:[6e6,"MΩ",1e-6,4],0x26:[6e7,"MΩ",1e-6,3]};
const FREQ_SCALE = {0x06:[60,"Hz",1,3],0x04:[600,"Hz",1,2],0x02:[6000,"Hz",1,1],0x18:[6000,"kHz",1e-3,4],0x16:[60000,"kHz",1e-3,3],0x14:[600000,"kHz",1e-3,2]};
const CAP_SCALE  = {0x06:[6e-9,"nF",1e9,3],0x04:[60e-9,"nF",1e9,2],0x02:[600e-9,"nF",1e9,1],0x16:[6e-6,"uF",1e6,3],0x14:[60e-6,"uF",1e6,2],0x12:[600e-6,"uF",1e6,1],0x26:[6e-3,"mF",1e3,3],0x24:[60e-3,"mF",1e3,2]};
const MODE_SLOTS = {VDC:["M1"],VAC:["M1","DUTY","FREQ"],"VDC+AC":["M1","DC","AC"],ADC:["M1"],AAC:["M1","DUTY","FREQ"],"ADC+AC":["M1","DC","AC"],RES:["M1"],RES_ONLINE:["M1"],CAP:["M1"],CONT:["M1"],DIODE:["M1","RES"],FREQ:["FREQ","DUTY"],TEMP:["TC","TF","TI"]};
const MODE_LABEL = {VDC:"DC電壓",VAC:"AC電壓","VDC+AC":"AC+DC電壓",ADC:"DC電流",AAC:"AC電流","ADC+AC":"AC+DC電流",RES:"電阻",RES_ONLINE:"線上電阻",CAP:"電容",CONT:"導通",DIODE:"二極體",FREQ:"頻率",TEMP:"溫度"};
const BASE_UNIT  = {VDC:"V",VAC:"V","VDC+AC":"V",ADC:"A",AAC:"A","ADC+AC":"A",RES:"Ω",RES_ONLINE:"Ω",CAP:"F",CONT:"Ω",DIODE:"V",FREQ:"Hz",TEMP:"°C"};
const MODE_GROUP = {VDC:"V",VAC:"V","VDC+AC":"V",ADC:"A",AAC:"A","ADC+AC":"A",RES:"R",RES_ONLINE:"R",CAP:"C",CONT:"D",DIODE:"D",FREQ:"F",TEMP:"F"};
const MODE_COLOR = { V:"#4c9aff", A:"#f5a83c", R:"#3fb950", C:"#a78bfa", D:"#ff8a5c", F:"#22d3ee" };
const ACDC_MARK  = {VDC:"⎓",VAC:"∿","VDC+AC":"≈",ADC:"⎓",AAC:"∿","ADC+AC":"≈"};

function resolveScale(slot, kind, signFlag) {
  const f = signFlag & 0xFE;
  if (slot === "FREQ") return FREQ_SCALE[f] || null;
  let info = null;
  if (slot === "M1" || slot === "DC" || slot === "AC") {
    if (kind.startsWith("V") || kind === "DIODE") info = ALT_SCALE[f];
    else if (kind.startsWith("A")) info = AMP_SCALE[f];
    else if (kind === "RES" || kind === "RES_ONLINE" || kind === "CONT") info = RES_SCALE[f];
    else if (kind === "CAP") info = CAP_SCALE[f];
  } else if (slot === "TC" && kind === "TEMP") info = [6000, "°C", 1, 1];
  else if (slot === "RES" && kind === "DIODE") info = [6000, "Ω", 1, 1];
  return info || null;
}

function parseFrame(b) { // b: Uint8Array，完整一幀（長度 = b[4] + 6，DM40C 實測 17 bytes）
  const n = b.length;
  if (n < 12) return null;
  for (let i = 0; i < 4; i++) if (b[i] !== HEADER[i]) return null;
  let sum = 0; for (const x of b) sum = (sum + x) & 0xFF;
  const crcOk = sum === 0;
  const fi = FLAG_INFO[b[5]];
  if (!fi) return { crcOk, unknownFlag: b[5] };
  const [kind, rangeNameRaw] = fi;
  const status = b[6];
  // counts 固定自頭端 [10..15]、scale bytes 自尾端 n-8/n-9/n-10（與 DM40GUI 的負索引一致）
  const m1 = (b[15] << 8) | b[14], m2 = (b[13] << 8) | b[12], m3 = (b[11] << 8) | b[10];
  return parseFrameInner(b, n, crcOk, kind, rangeNameRaw, status, m1, m2, m3);
}
function parseFrameInner(b, n, crcOk, kind, rangeName, status, m1, m2, m3) {
  const s1 = b[n - 8], s2 = b[n - 9], s3 = b[n - 10];
  const slots = MODE_SLOTS[kind];
  const r = {
    crcOk, kind, rangeName,
    batt: status & 0x07, charging: !!(status & 0x08), lock: !!(status & 0x40), hold: !!(status & 0x80),
    ol: m1 === 0xFFFF, value: null, disp: "OL", unit: "", dec: 2, extras: []
  };
  const res1 = resolveScale(slots[0], kind, s1);
  if (res1) {
    const [fs, unit, mul, dec] = res1;
    const effCounts = kind === "CAP" ? DEVICE_COUNTS / 10 : DEVICE_COUNTS;
    r.unit = unit; r.dec = dec; r.fsDisp = fs * mul; r.fsBase = fs;
    if (!r.ol) {
      const sign = (s1 & 1) ? -1 : 1;
      r.value = sign * m1 * (fs / effCounts);           // base unit
      r.disp = (r.value * mul).toFixed(dec);
    }
    if (!rangeName.startsWith("AUTO")) r.rangeName = (fs * mul).toPrecision(4).replace(/\.?0+$/, "") + unit;
  }
  const procSlot = (slot, counts, sf) => {
    const ol = counts === 0xFFFF;
    const rs = resolveScale(slot, kind, sf);
    if (rs) {
      const [fs, unit, mul, dec] = rs;
      if (ol) return ["OL", unit];
      const sign = (sf & 1) ? -1 : 1;
      return [(sign * counts * (fs / DEVICE_COUNTS) * mul).toFixed(dec), unit];
    }
    if (slot === "DUTY" || slot === "TF" || slot === "TI") {
      const v = ol ? "OL" : (counts * 0.1).toFixed(1);
      return [v, slot === "DUTY" ? "%" : (slot === "TF" ? "°F" : "°C 內部")];
    }
    return null;
  };
  if (slots.length > 1) { const e = procSlot(slots[1], m2, s2); if (e && e[0] !== "") r.extras.push([e[0], e[1], SLOT_LABEL[slots[1]] || ""]); }
  if (slots.length > 2) { const e = procSlot(slots[2], m3, s3); if (e && e[0] !== "") r.extras.push([e[0], e[1], SLOT_LABEL[slots[2]] || ""]); }
  return r;
}
const SLOT_LABEL = { RES: "電阻", DUTY: "占空比", FREQ: "頻率", DC: "DC 分量", AC: "AC 分量", TF: "華氏", TI: "內部溫度" };
