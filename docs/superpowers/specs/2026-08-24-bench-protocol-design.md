# 工作台量測協議與指紋庫 — 設計

**日期**：2026-08-24
**專案**：dm40-logger（inbox #22）
**路徑**：架構級（動到 dm40-logger 與 chuntech-api 之間的介面）
**狀態**：待春春審閱

---

## 1. 要解決什麼

維修時量到的數字現在只有兩個下場：留在工具的瀏覽器裡，或被複製成一段文字貼進對話。兩者都不能重複使用。

真正的目標不是「匯出 Excel」，而是 **讓量到的數字變成越修越厚的資產**：量一張好板得到指紋，下次拿壞板照著量，程式直接指出哪一腳偏離。

證據是春春自己寫的——repair 2026-0625-001 的 `summary.lesson`：

> 「對照同型好品 Re ≈ 22.7Ω⋯⋯此數據日後所有 MX400 換替代喇叭案可直接複用，免重測。」

那就是一筆指紋，只是困在散文裡，程式比對不了。

---

## 2. 範圍

### 做
**在一組固定量法下，對一串有序腳位各取一個讀值。** 涵蓋接口與晶片——兩者機制相同（都是二極體對地、腳位天生 1..N 有序），電源軌用「列出名稱」的方式套同一個結構。

### 不做（v1）
| 不做 | 為什麼 |
|---|---|
| 散點量測（其他電路） | 春春自己說「我也不太懂」。兩人都描述不出來的東西，現在定 schema 一定是錯的。等真實案例出現再從案例反推 |
| 波形／動態序列 | 形狀才是資訊，不是一個數字。留在維修單當附件 |
| Excel 匯入匯出 | 一旦協議成立，Excel/CSV/Markdown 都只是它的渲染器，隨時可加 |
| 即時雙向通道 | 見 §3 |
| Queue | 見 §3 |
| `access` 可量測性分級、容差統計 | 我自己發明的，春春沒要。跳過時寫一句話就夠 |

---

## 3. 傳輸：拉，不推

**決定：Worker + D1 的請求／回應。不用 Durable Object、不用 Queue、不用 WebSocket。**

### 為什麼不推
MCP 2026-07-28 規格 SEP-2260：伺服器發起的請求（sampling／elicitation）**只能在伺服器正在處理 AI 已發起的呼叫時發出**。`resources/subscribe` 通知規格裡有，但 Claude Code 端仍是 feature request。

**結論：MCP 是 pull。** 就算工作台與雲端之間掛了 WebSocket，Claude 仍然只在被叫時才看。即時通道最大的客戶進不去。

實際情境跑過一遍（見 artifact「推還是拉」）：從手機叫 Claude 建任務、走回工作台、按「取任務」——拉與推唯一的差別是第 9.5 秒多按一下按鈕，而那幾秒使用者在走路。

### 為什麼不用 Queue
Queues 自 2026-02-04 起免費方案可用（10,000 ops/天），所以不是錢的問題。工作台 POST 一份 sweep 是**一跳就完的事**。佇列該出場的時機是**下游扇出**（同時寫維修單、封存原始樣本、更新指紋庫），那時候是加在雲端內部，工具端一行都不用改。要「稍後重試」用 D1 之上的簡單重試即可。

### 為什麼不用 Durable Object
資料是全域的（跨所有板子查詢），不是每個 session 一份。D1 才是這個形狀。DO 是管連線的，而我們沒有連線要管。日後真要加即時，DO 管連線、D1 管資料，是加法不是重寫。

### 硬約束（2026-08-23 實測）
| 事實 | 影響 |
|---|---|
| `api.chuntech.org` → **401**（Cloudflare Access） | 瀏覽器沒法直接往那寫 |
| `files.chuntech.org` → **無 CORS 標頭** | 工具用 JS 抓不到，需同源代理 |
| `dm40c.chuntech.org` → **200，我們自己的 Worker** | 同源、無 Access、無 CORS — API 的落點 |

### 落點：一個 D1，綁兩個 Worker
D1 綁定只是在設定檔填 `database_id`，沒有獨佔。所以：

- **瀏覽器 → `dm40c` Worker**：同源、無認證障礙
- **Claude → `chuntech-api` 的 bench MCP 模組**：與 repair／files／inbox／parts 並排，治理一致
- **兩者綁同一個 D1**：一份資料、不用同步、不會有兩份真相

這化解了「該歸誰管」——答案是不用選。

### 認證
Worker 的 `/api/*` 驗 `Authorization: Bearer <token>`，token 由春春在工具設定頁貼一次、存 `localStorage`。**不套 Cloudflare Access**——多一個 Access 就多一個會壞的地方（參考 parts connector 的 OAuth 500）。日後需要再換。

---

## 4. 資料模型

### 四個家，各有理由

| 資料 | 住哪 | 為什麼 |
|---|---|---|
| 量測中的原始樣本 | 瀏覽器 IndexedDB | **只是斷網緩衝，不是家**。上傳完可丟 |
| 元件定義／量法／每腳讀值 | **D1** | 要查詢、要比對的東西全在這 |
| 照片 | chuntech-files | 檔案就該進檔案庫，D1 只存 URL |
| 給人看的結論 | repair 的 `measurement` block | 它屬於那張單。維修單不該塞 24 行數字 |

**repair 系統不需要任何改動。** 現有的 `repair_add_block(type=measurement)` 就夠用；`components.board` 填 `MMS-MB` 這種既有的模組型號，只是命名對齊。

### D1 三張表

```sql
-- 這塊板上有哪些東西可以量
CREATE TABLE components (
  id          TEXT PRIMARY KEY,   -- mms-mb.j5
  board       TEXT NOT NULL,      -- MMS-MB（對應 repair 的模組型號）
  ref         TEXT NOT NULL,      -- J5（絲印代號）
  name        TEXT NOT NULL,      -- USB 連接器
  layout      TEXT NOT NULL,      -- JSON，見 §5
  photo_url   TEXT,               -- files 的連結
  note        TEXT,               -- 前置條件：「要先拆屏蔽罩」
  created_at  TEXT, updated_at TEXT
);

-- 同一個元件可以有幾種量法
CREATE TABLE methods (
  id           TEXT PRIMARY KEY,  -- mms-mb.j5.diode
  component_id TEXT NOT NULL REFERENCES components(id),
  mode         TEXT NOT NULL,     -- DM40 檔位：VDC/VAC/ADC/AAC/RES/RES_ONLINE/CONT/DIODE/CAP/FREQ/TEMP
  power        TEXT NOT NULL,     -- 斷電 | 通電
  isolation    TEXT NOT NULL,     -- in_circuit | removed
  polarity     TEXT NOT NULL,     -- 黑棒接地、紅棒觸點 ← 反過來量是另一條路徑，不可省
  ref_point    TEXT NOT NULL,     -- GND（屏蔽罩固定螺絲）
  detects      TEXT,              -- 這個量法抓什麼
  created_at   TEXT, updated_at TEXT
);

-- 每一腳量到多少（好板與壞板同表）
CREATE TABLE readings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  method_id   TEXT NOT NULL REFERENCES methods(id),
  kind        TEXT NOT NULL,      -- baseline（好板）| actual（這次量的）
  pin         INTEGER NOT NULL,
  net         TEXT,               -- USB+
  value       REAL,               -- 開路時為 NULL
  unit        TEXT,
  flag        TEXT,               -- OL | NULL
  verdict     TEXT,               -- ok | ng | unknown | skipped
  skip_reason TEXT,
  asset_id    TEXT,               -- MMS-MB-0012
  repair_log  TEXT,               -- 2026-0823-001（內部量測可空）
  taken_at    TEXT NOT NULL
);
CREATE INDEX idx_readings_lookup ON readings(method_id, kind, pin);
CREATE INDEX idx_readings_asset  ON readings(asset_id);
```

**好板壞板同表，只差 `kind` 一欄。** 這是刻意的：今天量的壞板修好驗證過就直接升格當基準；而「這隻腳歷年量到什麼」永遠是同一句查詢。

### 比對就是表自己跟自己 join

```sql
SELECT a.pin, a.net, b.value AS expect, a.value AS actual,
       a.value - b.value AS delta
FROM   readings a
JOIN   readings b ON b.method_id = a.method_id
                 AND b.pin = a.pin AND b.kind = 'baseline'
WHERE  a.asset_id = ? AND a.kind = 'actual'
ORDER BY a.pin;
```

**腳位順序必須保留**——相鄰性本身是診斷資訊：單腳偏低＝那條網路對地短路；連續三四腳偏＝物理損傷（進液／撞擊）；整組偏＝共用電源軌塌了。

---

## 5. 腳位圖：SVG 是格式

**決定（春春 2026-08-24「都存」）：生成參數與 SVG 兩份都存。**

```jsonc
"layout": {
  "source": "generated",          // generated | edited | imported
  "shape":  "quad",               // row | dual | quad | grid
  "pins":   32,
  "dir":    "ccw",                // ccw（JEDEC 標準）| cw
  "start":  "bl",                 // pin 1 在哪個角：tl | bl | br | tr
  "svg":    "<svg …>"
}
```

### 三態決定衝突時誰說了算
| `source` | 意思 | 誰贏 |
|---|---|---|
| `generated` | 按參數生的 | **參數** — 改參數就重生 SVG |
| `edited` | 在生成的基礎上手改，腳數未變 | **圖** — 改參數前先問 |
| `imported` | 整份外來 | **圖** — 參數只是歷史 |

### SVG 契約（四條）
1. `data-pin="N"` → 第 N 腳，可點、依判定上色
2. `data-net="名稱"` → 腳位描述，**會讀回資料庫**
3. `class="body" | "origin" | "notch"` → 裝飾，不可點
4. **顏色不寫在 SVG 裡** → 由外部 class 控制，才能跟深淺色主題與判定顏色連動

**一張帶 `data-pin` + `data-net` 的 SVG 本身就是一份完整的元件定義**，可以單獨交付。日後從 datasheet 描、Inkscape 畫、或 ChipID/PCBAiDoctor 掃出座標，都只是產生 SVG 的不同方式，渲染器一行不用改。

### 生成器是捷徑，不是分類法
`row`（FFC／排針）、`dual`（DIP／SOIC）、`quad`（QFP）、`grid`（BGA）四種只是**產生 SVG 的便利函式**。新封裝是一筆資料，不是一段程式。

各方向的走法**各自正著生成**，不可用反轉陣列實作（反轉只有 quad 碰巧對，row/dual/grid 會亂序——此為已修正的實際 bug）：
- `quad` + `ccw` + `tl`：左緣↓ → 下緣→ → 右緣↑ → 上緣←（JEDEC）
- `start` 改變起始邊，走邊順序跟著輪轉

### 正反面
資料永遠存**規格書的真相**（正面）。介面提供「看焊接面」開關，只做畫面鏡像、不動資料。這是翻板子探棒時最容易數錯腳的地方。

### 安全（必要條件）
SVG 是使用者可寫、且會存進資料庫再渲染的內容 → **必須白名單消毒，且消毒要跑在寫入資料庫之前，不是渲染時。**

允許：`svg g defs title desc rect circle ellipse line polyline polygon path text tspan` 與畫圖用屬性。
移除：任何 `on*`、任何 `href`／`xlink:href`、`url()`、`foreignObject`、`script`、`use`、`a`、`animate*`。XML 解析失敗整份拒絕，不做部分套用。

已對 7 種 payload 實測（script／svg onload／元素 onclick／foreignObject+img／javascript: href／use 外部參照／animate href），含實際注入 DOM，皆未執行。

---

## 6. 協議：dm40.sweep/1

**一份文件，四個生命階段**——任務單與結果單是同一個東西，漸進填滿。工具現有的 `TASK.items` 就是這個結構。

```
Claude 建任務 → sweep（points 有 expect、measured 為 null）
逐點量       → 同一份的 measured 一格格填進去
量完上傳     → 還是那份，state: done
存成指紋     → 還是那份，kind: baseline
```

```jsonc
{
  "schema":   "dm40.sweep/1",
  "id":       "swp_2608240931_j5",
  "state":    "measuring",              // pending | measuring | done
  "kind":     "actual",                 // actual | baseline
  "component":"mms-mb.j5",
  "method":   "mms-mb.j5.diode",
  "baseline": "MMS-MB-0012",            // 照哪張指紋量的（可空）
  "context":  { "asset_id": "MMS-MB-0031", "repair_log": "2026-0823-001" },
  "points": [                           // 有序陣列，不可用 map
    { "pin": 1, "net": "VBUS", "expect": 0.512, "measured": 0.508, "verdict": "ok" },
    { "pin": 3, "net": "USB+", "expect": 0.495, "measured": 0.021, "verdict": "ng" },
    { "pin": 7, "net": "NC",   "expect": "OL",  "flag": "OL",      "verdict": "ok" },
    { "pin": 9, "net": "VCC5", "skipped": "屏蔽罩擋住，沒拆" }
  ]
}
```

### `expect` 只有三種（從六種砍下來）
| 形式 | 用途 |
|---|---|
| 數值 | 指紋來的基準值，配容差百分比 |
| `"OL"` | 該開路才對（NC 腳） |
| 省略 | 只記錄不判定 |

範圍與不等式（`4.75~5.25V`、`≥10MΩ`）**之後真的遇到再加**——對指紋驅動的掃描，`expect` 一律來自基準量測，所以永遠是數值。

### 開路是一等公民
`flag: "OL"` 不是缺值。二極體檔量 NC 腳「應該開路」，量到數值反而是異常。使用者可以在欄位直接打 `OL`。

### 原始樣本不上傳
每個測點只送摘要（`n` 筆、`ms` 時長、中位數）。24 點 × 每點 20 筆全送會讓 payload 肥十倍，而且 99% 用不到。原始波形留本機，需要時單獨要。

---

## 6.5 兩種量測（春春 2026-08-24 指出）

**這是兩件不同的事，介面與 payload 都必須不同。模式由「推過來的任務有沒有帶 baseline」決定。**

| | 建立黃金標準 | 拿基準比對 |
|---|---|---|
| `kind` | `baseline` | `actual` |
| 任務帶 | `source_asset`（從哪台好板量的） | `baseline`（拿哪份比） |
| 量的是 | 已知良品 | 待修板 |
| 表格欄位 | PIN／網路／量到／狀態 | PIN／網路／**基準／量到／差／判定** |
| 每點判定 | **沒有對錯**，只有「已記錄」 | ok／ng |
| point 內容 | `{pin, net, value}` | `{pin, net, value, verdict}` |
| 流程列 | 選元件 → 收到建基準任務 → 量好板 → 確認 → 存成黃金標準 | 選元件 → 收到比對任務 → 量待修板 → 比對 → 發給 Claude |
| Claude 回覆 | 「已存為基準，之後量同型板會自動帶上」 | 差異清單 ＋ 判讀 |

**為什麼重要**：建立基準時顯示「基準」「差」「判定」欄是**無意義的**——你正在建立那個基準，沒有東西可以比。原本的設計把兩者混成一種，會讓建基準的畫面出現空白或誤導的判定欄。

**比較不是永遠成立的。** 有基準才比得了，沒有就只是記錄。

---

## 7. 兩個模式（操作面）

| | 探索模式（建指紋） | 引導模式（用指紋） |
|---|---|---|
| 流程 | 放棒 → 記錄 → **順手命名／拍照** → 下一點 | 工具提示下一點 → 放棒 → 記錄 → 自動填 |
| 產出 | 一張新指紋（`kind: baseline`） | 一份實測 ＋ 自動比對 |
| 工具現況 | **沒有，v1 必做** | 已有（測點清單） |

**探索模式不做，指紋庫永遠是空的。** 而且成本應該收在量測當下（手已經在那、東西就在眼前），不是事後回想著打字。

### 指紋從哪來
不需要「原廠好板」，需要「一台目前能動的」——備品池（repair `status=received` 含「備品池待命／修好回池」）、庫內機、或**剛修好驗證過的那台**。第一張指紋通常是「修完那台時順手多花五分鐘」。

---

## 8. 工作台操作

### HOLD 鍵當觸發（零外設）
DM40 協議每一幀都回報 HOLD 鍵狀態——`public/js/01-protocol.js:71` 已經解出 `hold: !!(status & 0x80)`，但目前只拿來顯示一個小標籤。改成 **偵測 hold 由 false 轉 true 即記錄**，手完全不用離開表筆。

備案（零程式改動）：USB 腳踏開關送 Space 鍵，現有的 `public/js/04-live.js:45` 已經在等它。

### 記錄與換腳分開
**穩定 N 秒（0.3／0.5／1／2，可選）自動記錄**，記完**預設停在原地**，由使用者決定何時換腳。這對應工具現有的穩定段偵測（`PLATEAU_MS` 本來就是這個參數），不是新機制。

自動記完就跳走會讓人來不及確認。

### 介面（待確認，見 §11）
**定案（春春 2026-08-24）：不挑單一版本，三個視圖並存於同一頁。**

- **左**：腳位圖（常駐）＋ 當前腳大讀值 ＋ 編輯列
- **右**：全部腳位表格（常駐，非收合）
- **最上**：流程列，顯示現在在哪一步與各步狀態

窄螢幕自動改成上下堆疊。腳位圖常駐是因為**相鄰性是診斷資訊**，切走就看不到。

---

## 9. 用到的庫

實測 gzip 大小（對照：工具現有全部 JS ＝ 23.9 KB）：

| 用 | 大小 | 理由 |
|---|---|---|
| **MCP 官方 SDK** | — | 協議不自己寫，且與現有四個模組一致 |
| **Preact + hooks + htm** | **6.6 KB** | 解重繪失焦。寫原型時實際被咬：每次改狀態重畫 innerHTML → 輸入框失焦。零 build step，只有新的量測畫面用，舊的 12 支 classic script 照舊共存 |

| 不用 | 理由 |
|---|---|
| Web Bluetooth 庫 | 原生 API |
| 圖表庫 | 已手寫、能動、換掉零收益 |
| SheetJS（84–327 KB） | 20+ 格式一種都用不到；**寫入不支援樣式**（在付費 Pro）；已離開 npm registry |
| ExcelJS（252 KB） | 最後一次有意義發布 2023-10，維護者自稱 inactive |
| Alpine（18.9 KB） | 比 Preact 大三倍、能力更少 |
| D1 的 ORM | 三張表，原生 SQL 更清楚 |

`.xlsx` 寫出可零依賴（`CompressionStream('deflate-raw')` 已確認在春春的 Edge 可用，約 150 行），但需半小時 spike 驗證產出的檔 Excel 打得開。**不在 v1。**

---

## 10. 工作拆解

### 前置：兩小時的手感驗證（先做這個）
只做 **HOLD 鍵觸發** ＋ 現有測點清單手貼基準值。不碰 D1、不碰 MCP、不碰後端。

驗的是整套設計唯一的死穴：**逐點按 HOLD 掃 24 腳，手感到底順不順。** 如果掃到第 8 腳就煩了，後面全是白蓋的。HOLD 那段程式碼本來就要寫，不算浪費。

### 主體（約 3 天）
| 項目 | 估計 |
|---|---|
| D1 建表 ＋ `dm40c` Worker 的 `/api/*` 路由 | 半天 |
| 工具端：取清單、上傳、比對顯示 | 1 天 |
| 探索模式（邊量邊命名建指紋） | 半天 |
| HOLD 鍵觸發 | 1–2 小時（已含在前置） |
| bench MCP 模組掛進 chuntech-api | 半天 |

### bench MCP 工具（初版）
`bench_list_components` / `bench_get_component` / `bench_put_component`
`bench_get_baseline` / `bench_put_baseline`
`bench_list_sweeps` / `bench_get_sweep` / `bench_push_task`
`bench_diff`（實測 vs 指紋）

---

## 11. 待確認

1. **匯入腳數不一致** — 目前匯入 SVG 只有圖跟著變，資料列數沒調整。正式版應以 SVG 的 `data-pin` 為準重建腳位清單。已記在 `prototype/README.md`。

2. **黃金標準的容差從哪來** — 目前比對用固定 ±12%。從單一好板量出來的基準沒有散布資訊，所以容差只能用猜的。之後若累積多張好板，容差應該從實際觀測的散布推出來。v1 先用固定值，但這是已知的粗糙處。

---

## 12. 決策紀錄（為什麼不是別的樣子）

| 曾經考慮 | 為什麼放棄 |
|---|---|
| 指紋存 chuntech-files | files 自己的定位就是「不懂內容」的位元組台帳。指紋要按機型／群組／量法查詢，是內容感知的事 |
| 指紋存 repair `template.tests` | 那欄位確實存在且為空，綁 device_type 也對；但寫入需要新增 MCP 工具、改動 chuntech-api 的 repair 模組。指紋住 D1 後 repair 完全不用改 |
| Durable Object 當儲存 | 資料是全域的不是每 session 一份。DO 管連線，我們沒有連線要管 |
| WebSocket 即時推送 | MCP 是 pull，即時通道沒有客戶。等 inbox #18 常駐 agent 成熟再說 |
| 硬寫四種封裝形狀 | 永遠會漏第五種。改成 SVG 描述，新封裝是資料不是程式 |
| 反轉陣列做順時針 | 只有 quad 碰巧對，row/dual/grid 會亂序。已改成各方向正著生成 |
| `access` 四級可量測性分級 | 我自己發明的。跳過時寫一句話就夠 |

---

## 附錄：相關文件

- artifact「DM40 資料出口」— Excel 庫的實測比較
- artifact「工作台協議」— 三個架構方案與硬約束
- artifact「推還是拉」— B vs C 的時序動畫
- artifact「板子指紋庫」— 資料模型白話版
- artifact 原型 `prototype/sweep-ui.html` — 四種介面、mock 數據可操作
