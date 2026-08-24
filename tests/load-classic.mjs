// 在沙箱裡載入 classic script，取回它的全域——用來測 public/js/ 的純邏輯。
// 零依賴：只用 node 內建的 vm 與 node:test。
import { readFileSync } from "node:fs";
import vm from "node:vm";

export function loadClassic(path, stubs = {}) {
  const ctx = vm.createContext({
    console, Math, JSON, Date, isNaN, parseFloat, parseInt,
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { addEventListener() {}, getElementById: () => null,
                querySelector: () => null, querySelectorAll: () => [] },
    ...stubs
  });
  vm.runInContext(readFileSync(path, "utf8"), ctx, { filename: path });
  return ctx;
}
