"use strict";
// 08-ble.js — Web Bluetooth 連線、除錯主控台
// 載入順序固定：見 index.html 底部 <script> 清單（classic script，共用全域範圍）

/* ================================================================
   Web Bluetooth
   ================================================================ */
let bleDevice = null, rxBuf = [], bleWrite = null, pollWatchdog = null, lastRxT = 0;
/* ---------- 除錯主控台 ---------- */
const DBG = { lines: [], rx: 0, tx: 0, rxLogged: 0 };
function dlog(msg) {
  const t = new Date().toTimeString().slice(0, 8);
  DBG.lines.push(`[${t}] ${msg}`);
  if (DBG.lines.length > 500) DBG.lines.splice(0, 100);
  const el = $("dbgLog");
  if (el && el.offsetParent !== null) { el.textContent = DBG.lines.slice(-120).join("\n"); el.scrollTop = el.scrollHeight; }
}
const hex = u8 => Array.from(u8).map(b => b.toString(16).padStart(2, "0")).join(" ").toUpperCase();
let writeErrToasted = false, txChain = Promise.resolve(), txQueued = 0;
function sendCmd(bytes) {
  // 序列化：同一裝置同時只允許一個 GATT 操作，全部排進單一佇列
  txQueued++;
  txChain = txChain.then(async () => {
    txQueued--;
    if (!bleWrite) { dlog("TX 略過：無寫入特徵"); return; }
    try {
      if (bleWrite.properties && bleWrite.properties.writeWithoutResponse && bleWrite.writeValueWithoutResponse)
        await bleWrite.writeValueWithoutResponse(bytes);
      else await bleWrite.writeValue(bytes);
      DBG.tx++;
      if (DBG.tx <= 8) dlog("TX " + hex(bytes));
    } catch (e) {
      dlog("TX 失敗 " + e.name + ": " + e.message);
      if (!writeErrToasted) { writeErrToasted = true; toast("指令寫入失敗：" + e.name + "（開除錯面板看詳情）"); }
    }
  });
  return txChain;
}
function setConn(state, text) {
  const chip = $("connChip");
  chip.className = "chip " + state;
  $("connText").textContent = text;
  const live = state === "ok" || state === "sim";
  const rec = $("sbRec");
  rec.textContent = live ? "● 錄製中" : "STOP";
  rec.classList.toggle("on", live);
  const idle = $("heroIdle");
  if (idle) idle.style.display = live ? "none" : "flex";
  if (!live) { const mchip = $("modeChip"); if (mchip) mchip.textContent = "未連線"; }
}
$("btnConnect").addEventListener("click", async () => {
  // 診斷一：內嵌框架（預覽視窗）擋藍牙
  if (window.self !== window.top) {
    alert("⚠️ 目前是在預覽視窗（內嵌框架）裡，瀏覽器會封鎖藍牙。\n\n請把這個 HTML 檔下載到電腦，對檔案按右鍵 →「開啟方式」→ Chrome 或 Edge，再按連線。");
    return;
  }
  // 診斷二：瀏覽器不支援
  if (!navigator.bluetooth) {
    alert("⚠️ 這個瀏覽器沒有 Web Bluetooth。\n\n請改用 Chrome 或 Edge 開啟本檔案（Firefox / Safari 不支援）。");
    return;
  }
  // 診斷三：Brave 預設封鎖 Web Bluetooth
  if (navigator.brave) {
    let braveOk = false;
    try { braveOk = await navigator.bluetooth.getAvailability(); } catch (e) {}
    if (!braveOk) {
      alert("⚠️ 偵測到 Brave 瀏覽器。\n\nBrave 預設封鎖 Web Bluetooth。兩個解法擇一：\n① 改用 Chrome 或 Edge 開這個檔案（推薦）\n② 在 Brave 網址列輸入 brave://flags/#brave-web-bluetooth-api，設為 Enabled 後重啟 Brave");
      return;
    }
  }
  // 診斷四：電腦藍牙未開（僅警告，不擋——部分瀏覽器誤報 false）
  try {
    if (navigator.bluetooth.getAvailability && !(await navigator.bluetooth.getAvailability())) {
      toast("⚠️ 瀏覽器回報藍牙不可用——若確定藍牙開著就繼續試，否則請檢查 Windows 藍牙設定");
    }
  } catch (e) {}
  await pickAndConnect(false);
});
async function pickAndConnect(showAll) {
  try {
    setConn("", "掃描中…");
    const OPT_SVCS = [0xfff0, 0xffe0, 0xff00, 0xffb0, "device_information", "battery_service"];
    const req = showAll
      ? { acceptAllDevices: true, optionalServices: OPT_SVCS }
      : { filters: [{ services: [BLE_SERVICE] }, { namePrefix: "DM40" }, { namePrefix: "ATK" }, { namePrefix: "C-" }], optionalServices: OPT_SVCS };
    bleDevice = await navigator.bluetooth.requestDevice(req);
    bleDevice.addEventListener("gattserverdisconnected", onDisconnect);
    await bleAttach();
  } catch (e) {
    setConn("err", "未連線");
    if (e.name === "NotFoundError") {
      if (!showAll && confirm("清單裡沒看到你的電表？\n\n按「確定」改列出附近所有藍牙裝置，再從中選你的 DM40（例如 C-1-ATK-DM40-CALI）。\n\n（也請確認 DM40 已在 設定→其他設定 開藍牙，且沒被手機 APP 佔線）")) {
        await pickAndConnect(true);
      }
    }
    else if (e.name === "NotAllowedError") alert("⚠️ 藍牙權限被拒。\n\n若在公司/受管理的電腦，Chrome 可能被政策停用 Web Bluetooth；也請確認沒有在無痕或內嵌視窗中開啟。\n\n錯誤：" + e.message);
    else alert("連線失敗（" + e.name + "）：" + e.message);
  }
}
async function bleAttach() {
  setConn("", "連線中…");
  dlog("連線 " + (bleDevice.name || "(無名稱)") + " id=" + bleDevice.id);
  const server = await bleDevice.gatt.connect();
  dlog("GATT 已連線，枚舉服務…");
  let services = [];
  try { services = await server.getPrimaryServices(); } catch (e) { dlog("枚舉服務失敗 " + e.name); }
  let svc = null, ch = null;
  for (const s of services) {
    let chs = [];
    try { chs = await s.getCharacteristics(); } catch (e) {}
    dlog("服務 " + s.uuid + " 特徵×" + chs.length);
    for (const c of chs) {
      const p = c.properties;
      dlog("  特徵 " + c.uuid + " [" + ["read","write","writeWithoutResponse","notify","indicate"].filter(k => p[k]).join(",") + "]");
      if (!ch && (p.notify || p.indicate)) { ch = c; svc = s; }
    }
  }
  // 優先用標準 fff0/fff1，枚舉失敗或找不到才退回自動挑選
  try {
    const s0 = await server.getPrimaryService(BLE_SERVICE);
    const c0 = await s0.getCharacteristic(BLE_NOTIFY);
    svc = s0; ch = c0;
    dlog("採用標準 fff0/fff1");
  } catch (e) { dlog("標準 fff0/fff1 不可用（" + e.name + "），改用自動挑選：" + (ch ? ch.uuid : "無 notify 特徵！")); }
  if (!ch) throw new Error("找不到任何 notify 特徵，無法接收數據");
  await ch.startNotifications();
  dlog("已訂閱 notify " + ch.uuid);
  ch.addEventListener("characteristicvaluechanged", e => {
    const dv = e.target.value;
    DBG.rx++;
    if (DBG.rxLogged < 15) { DBG.rxLogged++; dlog("RX(" + dv.byteLength + ") " + hex(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength))); }
    for (let i = 0; i < dv.byteLength; i++) rxBuf.push(dv.getUint8(i));
    while (rxBuf.length >= 6) {
      if (rxBuf[0] === HEADER[0] && rxBuf[1] === HEADER[1] && rxBuf[2] === HEADER[2] && rxBuf[3] === HEADER[3]) {
        const flen = rxBuf[4] + 6;               // header4 + len1 + payload + checksum1
        if (flen < 12 || flen > 32) { rxBuf.shift(); continue; }
        if (rxBuf.length < flen) break;          // 這幀還沒收齊
        const frame = Uint8Array.from(rxBuf.slice(0, flen));
        rxBuf.splice(0, flen);
        const m = parseFrame(frame);
        if (m) {
          if (!m.crcOk || m.unknownFlag !== undefined) {
            S.crcFail++;
            if (S.crcFail <= 3) dlog("幀被丟棄 crcOk=" + m.crcOk + " flag=" + (m.unknownFlag !== undefined ? "0x" + m.unknownFlag.toString(16) : "ok") + " : " + hex(frame));
            continue;
          }
          pushSample(m);
        }
      } else rxBuf.shift();
    }
    lastRxT = Date.now();
    if (txQueued < 2) sendCmd(CMD_READ); // 積極輪詢：收一包立刻討下一包，把採樣率頂到韌體上限
  });
  bleWrite = null;
  try { bleWrite = await svc.getCharacteristic(BLE_WRITE); dlog("採用標準寫入特徵 fff3"); }
  catch (e) {
    let chs = []; try { chs = await svc.getCharacteristics(); } catch (e2) {}
    bleWrite = chs.find(c => c.properties.write || c.properties.writeWithoutResponse) || null;
    dlog("fff3 不可用，自動挑選寫入特徵：" + (bleWrite ? bleWrite.uuid : "找不到！"));
  }
  S.connected = true; S.sim = false; stopSim();
  setConn("ok", bleDevice.name || "DM40 已連線");
  toast("已連線 " + (bleDevice.name || "DM40"));
  // 開機：先 CMD_ID 初始化，再發第一包 CMD_READ 啟動循環
  await sendCmd(CMD_ID);
  await new Promise(r => setTimeout(r, 200));
  lastRxT = Date.now();
  await sendCmd(CMD_READ);
  // 加速器 + 看門狗：推流偏慢（<8Hz）主動加問補速；靜默 1.2 秒視為斷流重新討
  if (pollWatchdog) clearInterval(pollWatchdog);
  pollWatchdog = setInterval(() => {
    if (!S.connected || txQueued >= 2) return;
    const now = Date.now();
    while (S.rateWin.length && now - S.rateWin[0] > 3000) S.rateWin.shift();
    const rate = S.rateWin.length > 1 ? ((S.rateWin.length - 1) / ((S.rateWin[S.rateWin.length - 1] - S.rateWin[0]) / 1000)) : 0;
    if (now - lastRxT > 1200 || rate < 8) sendCmd(CMD_READ);
  }, 120);
}
async function onDisconnect() {
  S.connected = false; bleWrite = null;
  if (pollWatchdog) { clearInterval(pollWatchdog); pollWatchdog = null; }
  setConn("err", "已斷線，重連中…");
  plateauFinalize();
  for (let i = 0; i < 5 && bleDevice; i++) {
    try { await new Promise(r => setTimeout(r, 1200 * (i + 1))); await bleAttach(); return; }
    catch (e) {}
  }
  setConn("err", "已斷線");
  toast("藍牙斷線，請按「連線」重連");
}
