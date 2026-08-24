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

## 版面儲存決議（春春 2026-08-24：「都存」）
參數與 SVG 兩份都存，用 `source` 三態決定衝突時誰說了算：
- `generated` — 參數說了算，改參數就重生 SVG
- `edited`    — 在生成的基礎上手改，腳數未變
- `imported`  — 整份外來，參數無意義，圖說了算

**匯入的 SVG 自帶 `data-pin` + `data-net` 時，它本身就是一份完整的元件定義。**

### 已知缺口（正式版要補）
匯入腳數與封裝腳數不一致時，目前只有圖跟著變，資料列數沒跟著調整。
正式版匯入應該以 SVG 的 `data-pin` 為準，重建腳位清單。
