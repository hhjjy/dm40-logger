import { test } from "node:test";
import assert from "node:assert/strict";
import { loadClassic } from "./load-classic.mjs";

const load = () => loadClassic("public/js/13-hold.js", { doMark: () => {} });

test("hold 由 false 轉 true 才算一次按下", () => {
  const { holdRising } = load();
  const st = { prev: false };
  assert.equal(holdRising(st, true), true, "第一次按下");
});

test("持續按著不會重複觸發", () => {
  const { holdRising } = load();
  const st = { prev: false };
  holdRising(st, true);
  assert.equal(holdRising(st, true), false, "還按著");
  assert.equal(holdRising(st, true), false, "仍然按著");
});

test("放開不觸發，放開後再按才觸發", () => {
  const { holdRising } = load();
  const st = { prev: false };
  holdRising(st, true);
  assert.equal(holdRising(st, false), false, "放開");
  assert.equal(holdRising(st, true), true, "再按一次");
});

test("一直沒按就一直不觸發", () => {
  const { holdRising } = load();
  const st = { prev: false };
  for (let i = 0; i < 5; i++) assert.equal(holdRising(st, false), false);
});

test("undefined 當成沒按，不會誤觸發", () => {
  const { holdRising } = load();
  const st = { prev: false };
  assert.equal(holdRising(st, undefined), false);
  assert.equal(holdRising(st, true), true);
});
