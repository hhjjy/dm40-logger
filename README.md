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

## 開發
單檔架構：`index.html` 內含全部 CSS/JS 與內嵌字體（Inter / Space Grotesk, OFL）。
部署：Cloudflare Pages 直接上傳 `index.html` + `robots.txt`（根層）。

## 授權與致謝
MIT License。BLE 協議解析參考 [maj113/DM40GUI](https://github.com/maj113/DM40GUI) 與
[Urobotos/DM40-Wireless](https://github.com/Urobotos/DM40-Wireless)（皆 MIT）。圖標 Lucide（ISC）。
