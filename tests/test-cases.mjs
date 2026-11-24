// 课程设计测试用例脚本：直接加载 sort_core.wasm，跑报告【测试】章节的 T1~T4
// 用法：node tests/test-cases.mjs [规模，默认 100000]
// 输出：T1~T4 的判定结果 + 10 万随机数据的八算法耗时/比较/移动表

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wasm = fs.readFileSync(path.join(here, '..', 'sort_core.wasm'));
const { instance } = await WebAssembly.instantiate(wasm, {
  env: { emit_frame() {}, high_res_time: () => performance.now() },
});
const e = instance.exports;

const NAMES = ['直接插入', '折半插入', '希尔', '冒泡', '快速', '简单选择', '堆排序', '归并'];
const THEORY_STABLE = [true, true, false, true, false, false, false, true];
const SCALE = Number(process.argv[2]) || 100000;

// ---------- 工具 ----------
const width = (s) => [...String(s)].reduce((w, ch) => w + (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1), 0);
const pad = (s, w) => String(s) + ' '.repeat(Math.max(0, w - width(s)));
function row(cells, widths) {
  return '| ' + cells.map((c, i) => pad(c, widths[i])).join(' | ') + ' |';
}
function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(width(h), ...rows.map((r) => width(r[i]))));
  console.log(row(headers, widths));
  console.log('|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|');
  rows.forEach((r) => console.log(row(r, widths)));
}
const view = (n) => new Int32Array(e.memory.buffer, e.input_ptr() >>> 0, n);
const hasStablePtr = typeof e.stable_ptr === 'function';
const stableView = (n) => (hasStablePtr ? new Int32Array(e.memory.buffer, e.stable_ptr() >>> 0, n * 2) : null);
function load(arr) { view(arr.length).set(arr); }
function sortOnce(alg, n) { return e.sort_run(alg, n, 0); }

let failed = 0;
const verdict = (ok, pass = 'PASS', fail = 'FAIL') => (ok ? pass : (failed++, fail));

// ---------- T1 结果一致性 ----------
const n1 = Math.min(SCALE, 2000);
const base = Int32Array.from({ length: n1 }, (_, i) => ((i * 7919 + 13) % n1) + 1);
const expected = Int32Array.from(base).sort();
const outputs = [];
for (let alg = 0; alg < 8; alg++) {
  load(base);
  const ok = sortOnce(alg, n1);
  outputs.push({ alg, ok, arr: Int32Array.from(view(n1)) });
}
const allSorted = outputs.every((o) => o.ok === 1 && o.arr.every((v, i) => v === expected[i]));
const allSame = outputs.every((o) => o.arr.every((v, i) => v === outputs[0].arr[i]));
const t1 = allSorted && allSame;

console.log(`\n===== T1 同一数组八种算法排序（n=${n1}，确定性数据）=====`);
table(
  ['算法', '结果升序', '与基准一致'],
  outputs.map((o) => [NAMES[o.alg], String(o.ok === 1), String(o.arr.every((v, i) => v === outputs[0].arr[i]))]),
);
console.log(`T1 八种算法结果数组完全相同且升序 -> ${verdict(t1)}`);

// ---------- T2 正序输入：冒泡 vs 快排 ----------
const n2 = Math.min(SCALE, 10000);
const ascending = Int32Array.from({ length: n2 }, (_, i) => i + 1);
const log2n = Math.log2(n2);
load(ascending); sortOnce(3, n2);
const bubbleCmp = Number(e.comparisons());
load(ascending); sortOnce(4, n2);
const quickCmp = Number(e.comparisons());
const bubbleOk = bubbleCmp === n2 - 1;
const quickOk = quickCmp < n2 * log2n * 2;   // 数量级判据：远小于 n²
console.log(`\n===== T2 正序输入（n=${n2}）=====`);
table(
  ['算法', '比较次数', '理论量级', '实测/理论', '判定'],
  [
    ['冒泡', bubbleCmp.toLocaleString(), `n-1 = ${(n2 - 1).toLocaleString()}`, (bubbleCmp / (n2 - 1)).toFixed(2), verdict(bubbleOk)],
    ['快速', quickCmp.toLocaleString(), `n·log2n ≈ ${Math.round(n2 * log2n).toLocaleString()}`, (quickCmp / (n2 * log2n)).toFixed(2), verdict(quickOk)],
  ],
);
const t2 = bubbleOk && quickOk;
console.log(`T2 正序：冒泡 n-1 次、快排约 n log n（远小于 n²）-> ${verdict(t2)}`);

// ---------- T3 逆序输入：快排三数取中退化防护 ----------
const n3 = SCALE;
const descending = Int32Array.from({ length: n3 }, (_, i) => n3 - i);
const sameValues = new Int32Array(n3).fill(7);
const t3rows = [];
let t3 = true;
for (const [label, data] of [['逆序', descending], ['全部相同', sameValues]]) {
  load(data);
  let ok = 0, crash = '';
  try {
    ok = sortOnce(4, n3);
  } catch (err) {
    crash = err.message;
  }
  const ms = e.elapsed_ms();
  const cmp = Number(e.comparisons());
  const sortedOk = ok === 1 && view(n3).every((v, i) => i === 0 || view(n3)[i - 1] <= v);
  const quadratic = n3 * n3 / 2;
  const noDegrade = cmp < quadratic / 4;
  t3rows.push([label, String(ok === 1), crash || '无', cmp.toLocaleString(), ms.toFixed(2), verdict(sortedOk && noDegrade)]);
  t3 = t3 && sortedOk && noDegrade && !crash;
}
console.log(`\n===== T3 逆序/全相同输入下的快排（三数取中，n=${n3}）=====`);
table(['输入', '排序正确', '栈溢出/崩溃', '比较次数', '耗时(ms)', '判定'], t3rows);
console.log(`T3 不出现栈溢出，比较次数未退化为 O(n²) -> ${verdict(t3)}`);

// ---------- T4 稳定性（带 id 的记录） ----------
const STABLE_N = 32;
const t4rows = [];
let t4 = true;
for (let alg = 0; alg < 8; alg++) {
  const ret = e.stability_run(alg);
  const judged = ret === 1;
  let byId = 'n/a';
  let byIdOk = true;
  const rec = stableView(STABLE_N);
  if (rec) {
    byIdOk = true;
    for (let i = 1; i < STABLE_N; i++) {
      if (rec[i * 2] === rec[(i - 1) * 2] && rec[i * 2 + 1] < rec[(i - 1) * 2 + 1]) byIdOk = false;
    }
    byId = byIdOk ? '稳定' : '不稳定';
  }
  const match = judged === THEORY_STABLE[alg] && (!rec || byIdOk === THEORY_STABLE[alg]);
  t4rows.push([NAMES[alg], String(THEORY_STABLE[alg]), judged ? '稳定' : '不稳定', byId, verdict(match)]);
  t4 = t4 && match;
}
console.log(`\n===== T4 含相同关键字的记录排序（key = i % 3, id = i，共 ${STABLE_N} 条）=====`);
table(['算法', '理论', 'C 核心判定', '按 id 复核', '判定'], t4rows);
if (!hasStablePtr) console.log('（当前 wasm 未导出 stable_ptr，按 id 复核列跳过）');
for (const alg of [0, 4]) {
  e.stability_run(alg);
  const rec = stableView(STABLE_N);
  const seq = rec
    ? Array.from({ length: STABLE_N }, (_, i) => `${rec[i * 2]}#${rec[i * 2 + 1]}`).join(' ')
    : '（无 stable_ptr，无法打印序列）';
  console.log(`${NAMES[alg]}排序后的 (key#id) 序列 -> ${seq}`);
}
console.log(`T4 稳定性结论与理论一致 -> ${verdict(t4)}`);

// ---------- 【运行】10 万随机数据的八算法对比 ----------
const n5 = SCALE;
const randomData = Int32Array.from({ length: n5 }, (_, i) => ((i * 1103515245 + 12345) >>> 8) % n5);
const perfRows = [];
for (let alg = 0; alg < 8; alg++) {
  load(randomData);
  const ok = sortOnce(alg, n5);
  perfRows.push([NAMES[alg], e.elapsed_ms().toFixed(2), Number(e.comparisons()).toLocaleString(), Number(e.moves()).toLocaleString(), ok === 1 ? '通过' : '失败']);
}
console.log(`\n===== 附：n=${n5} 随机数据八算法实测 =====`);
table(['算法', '耗时(ms)', '比较次数', '移动次数', '有序性'], perfRows);

console.log(`\n总计：${failed === 0 ? '全部用例通过' : failed + ' 项判定失败'}`);
process.exit(failed === 0 ? 0 : 1);
