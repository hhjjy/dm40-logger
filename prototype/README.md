# prototype/ — 丟棄用，不是產品程式

回答的問題：「量測 → 編輯 → 發給 Claude」這個流程，介面該長什麼樣？

- `sweep-ui.html` — 三種結構完全不同的量測畫面，用底部工具列切換（?variant=A|B|C）
- 全部是 mock 數據，沒有後端、沒有 BLE、不存任何東西
- 選定之後：把贏的那個折進 public/，整個 prototype/ 資料夾刪掉

**結論欄（選定後填）**：待定

## 安全性（正式版必須帶走的一條）
SVG 是使用者可寫、且會存進資料庫再渲染的內容 → **必須消毒**。
原型用白名單（`sanitizeSVG`）：只允許畫圖用的元素與屬性，`on*`、
任何 href、`foreignObject`、`script`、`use`、`a`、`animate` 全部移除。
**正式版要把這一步做在「寫入資料庫之前」，不是渲染時。**
測過 7 種 payload（script / onload / onclick / foreignObject+img /
javascript: href / use 外部參照 / animate href），皆未執行。
