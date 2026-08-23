# DM40 Logger

正點原子（ALIENTEK）DM40/DM40C 萬用表的免安裝網頁上位機 — Chrome/Edge 直連 Web Bluetooth。

**Live**: https://dm40c.chuntech.org/

## 功能
- BLE 直連 DM40（17-byte 幀協議，長度欄自適應）、積極輪詢拉滿採樣率
- 全程記錄（IndexedDB）＋穩定段自動擷取（進場跳變判準，防空接漂移誤擷取）
- 雙情境介面：量測中（超大讀值/迷你曲線/指針儀表）↔ 回顧（檢視卡+時間軸+清單），Tab 切換
- 測點清單引導量測：貼上「名稱, 預期值, 容差%」清單 → 逐點提示、自動填入、自動判 ✓/✗
- 判定標記、備註、模式篩選、歷史場次瀏覽、CSV / Markdown / 快照圖卡（剪貼簿）輸出
- 「問 Claude」：勾選數據打包成分析提問

## 專案結構

```
public/                 ← 部署根目錄（Workers Static Assets 直接上傳這個資料夾）
├─ index.html           ← 純 HTML 骨架；底部依序載入 js/
├─ robots.txt
├─ css/
│  ├─ fonts.css         ← @font-face（Inter 400/500/600 → "InterE"，Space Grotesk 500/700 → "SGro"）
│  └─ app.css           ← 版面與三套風格（carbon / studio / …）的 CSS 變數
├─ fonts/*.woff2        ← 自託管字體（OFL），瀏覽器可快取
└─ js/                  ← classic script，共用全域範圍，**載入順序固定**
   ├─ 01-protocol.js    ← BLE 協議常數、旗標表、parseFrame（移植自 maj113/DM40GUI）
   ├─ 02-state.js       ← 全域狀態 S、$ 小工具、toast、IndexedDB
   ├─ 03-capture.js     ← 穩定段偵測（plateau）、樣本入列
   ├─ 04-live.js        ← 即時面板、手動標記、候選清單
   ├─ 05-detail.js      ← 檢視卡（回顧頁大讀值）
   ├─ 06-export.js      ← CSV / Markdown 匯出、快照圖卡
   ├─ 07-charts.js      ← 時間軸圖、迷你曲線、指針儀表
   ├─ 08-ble.js         ← Web Bluetooth 連線、除錯主控台
   ├─ 09-sim.js         ← 模擬模式（無硬體時的假資料）
   ├─ 10-ui.js          ← 視圖切換、情境標籤、截圖、篩選、歷史場次
   ├─ 11-tasks.js       ← 測點清單引導量測
   └─ 12-settings.js    ← 擷取參數、除錯面板、風格切換
wrangler.jsonc          ← Cloudflare 設定（assets.directory=public、自訂網域 dm40c.chuntech.org）
package.json            ← npm scripts：dev / deploy / check
```

沒有 build step：改完 `public/` 裡的檔案就是成品。

## 開發

```bash
npm install            # 只裝 wrangler
npm run dev            # http://localhost:8787 — localhost 是 secure context，Web Bluetooth 可用
npm run check          # 12 支 js 語法檢查
```

新增功能：在對應的 `js/NN-*.js` 加程式；需要新檔就照編號接在後面，並在 `index.html` 底部加一行 `<script src>`。
後面的檔案可以呼叫前面定義的函式與變數；反過來只能在函式內部（執行期）引用。

## 部署

```bash
npx wrangler login     # 第一次
npm run deploy         # 上傳 public/ 並自動綁 dm40c.chuntech.org（DNS 由 wrangler 建立）
```

## 授權與致謝
MIT License。BLE 協議解析參考 [maj113/DM40GUI](https://github.com/maj113/DM40GUI) 與
[Urobotos/DM40-Wireless](https://github.com/Urobotos/DM40-Wireless)（皆 MIT）。圖標 Lucide（ISC）。
字體 Inter 與 Space Grotesk（SIL OFL 1.1）。
