// 课程设计测试用例脚本：直接加载 sort_core.wasm，执行 T1~T8 自动化测试与多规模基准对比
// 用法：
//   node tests/test-cases.mjs [规模，默认 100000]
//   node tests/test-cases.mjs --multi   （依次复测 1,000 / 5,000 / 10,000 / 50,000 / 100,000 五档规模）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wasm = fs.readFileSync(path.join(here, '..', 'sort_core.wasm'));
let frameCount = 0;
const { instance } = await WebAssembly.instantiate(wasm, {
  env: {
    emit_frame() { frameCount++; },
    high_res_time: () => performance.now(),
  },
});
const e = instance.exports;

const NAMES = ['直接插入', '折半插入', '希尔', '冒泡', '快速', '简单选择', '堆排序', '归并'];
const THEORY_STABLE = [true, true, false, true, false, false, false, true];
const MULTI_MODE = process.argv.includes('--multi');
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

// ---------- T5 空数组与单元素极小边界 ----------
let t5EmptyOk = true;
let t5SingleOk = true;
for (let alg = 0; alg < 8; alg++) {
  const r0 = sortOnce(alg, 0);
  if (r0 !== 1 || Number(e.comparisons()) !== 0) t5EmptyOk = false;
  view(1)[0] = 42;
  const r1 = sortOnce(alg, 1);
  if (r1 !== 1 || view(1)[0] !== 42 || Number(e.comparisons()) !== 0) t5SingleOk = false;
}
const t5 = t5EmptyOk && t5SingleOk;
console.log('\n===== T5 空数组与单元素极小边界（n=0 / n=1，八种算法）=====');
table(
  ['边界场景', '覆盖算法数', '比较次数', '状态返回值', '判定'],
  [
    ['空数组 n=0', '8 / 8', '0', '全部返回 1（安全退出）', verdict(t5EmptyOk)],
    ['单元素 n=1 (key=42)', '8 / 8', '0', '全部返回 1 且值保持 42', verdict(t5SingleOk)],
  ],
);
console.log(`T5 空数组与单元素边界无越界崩溃 -> ${verdict(t5)}`);

// ---------- T6 规模越界与非法算法编号拦截 ----------
const rNegN = sortOnce(0, -1);
const rOverN = sortOnce(0, 100001);
const rBadAlgLo = sortOnce(-1, 10);
const rBadAlgHi = sortOnce(8, 10);
const rBadStable = e.stability_run(8);
const t6 = rNegN === -1 && rOverN === -1 && rBadAlgLo === -1 && rBadAlgHi === -1 && rBadStable === -1;
console.log('\n===== T6 规模越界与非法算法编号异常拦截 =====');
table(
  ['异常输入场景', '调用接口', '预期返回值', '实测返回值', '判定'],
  [
    ['负数长度 n=-1', 'sort_run(0, -1, 0)', '-1', String(rNegN), verdict(rNegN === -1)],
    ['超上限规模 n=100001', 'sort_run(0, 100001, 0)', '-1', String(rOverN), verdict(rOverN === -1)],
    ['非法算法号 alg=-1 / 8', 'sort_run(-1|8, 10, 0)', '-1 / -1', `${rBadAlgLo} / ${rBadAlgHi}`, verdict(rBadAlgLo === -1 && rBadAlgHi === -1)],
    ['稳定性非法算法号 alg=8', 'stability_run(8)', '-1', String(rBadStable), verdict(rBadStable === -1)],
  ],
);
console.log(`T6 越界长度与非法算法编号全部安全拦截 -> ${verdict(t6)}`);

// ---------- T7 可视化快照门控（n<=50 开启 vs n>50 自动阻断） ----------
const desc50 = Int32Array.from({ length: 50 }, (_, i) => 50 - i);
const snapRows = [];
let t7 = true;
for (const [alg, expectedFrames] of [[0, 51], [4, 72], [2, 205], [3, 1227]]) {
  load(desc50);
  frameCount = 0;
  const ok = e.sort_run(alg, 50, 1);
  const pass = ok === 1 && frameCount === expectedFrames;
  t7 = t7 && pass;
  snapRows.push([`${NAMES[alg]} (n=50, vis=1)`, String(expectedFrames), String(frameCount), `${(frameCount * 50 * 8 / 1024).toFixed(1)} KB`, verdict(pass)]);
}
const desc51 = Int32Array.from({ length: 51 }, (_, i) => 51 - i);
load(desc51);
frameCount = 0;
const ok51 = e.sort_run(3, 51, 1);
const gateOk = ok51 === 1 && frameCount === 0;
t7 = t7 && gateOk;
snapRows.push(['冒泡超限门控 (n=51, vis=1)', '0 (自动阻断)', String(frameCount), '0.0 KB', verdict(gateOk)]);
console.log('\n===== T7 自主增强快照帧数核验与 n>50 门控保护 =====');
table(['场景', '预期帧数', '实测帧数', '快照内存估算', '判定'], snapRows);
console.log(`T7 快照帧数精准且 n>50 门控生效 -> ${verdict(t7)}`);

// ---------- T8 多随机种子跨样本复现性验证 ----------
const seeds = [10007, 424242, 20261127];
const n8 = Math.min(SCALE, 5000);
const seedRows = [];
let t8 = true;
for (const seed of seeds) {
  let state = seed >>> 0;
  const arr = Int32Array.from({ length: n8 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % n8;
  });
  const ref = Int32Array.from(arr).sort();
  let consistent = true;
  const cmps = [];
  const movs = [];
  for (let alg = 0; alg < 8; alg++) {
    load(arr);
    const ok = sortOnce(alg, n8);
    if (ok !== 1 || !view(n8).every((v, idx) => v === ref[idx])) consistent = false;
    cmps.push(Number(e.comparisons()));
    movs.push(Number(e.moves()));
  }
  // 验证：折半插入移动次数与直接插入完全一致且比较下降 >95%；高阶算法比较远少于平方级（<15%）
  const binSameMov = movs[1] === movs[0] && cmps[1] < cmps[0] * 0.05;
  const nlognFaster = Math.max(cmps[4], cmps[6], cmps[7]) < Math.min(cmps[0], cmps[3], cmps[5]) * 0.15;
  const okSeed = consistent && binSameMov && nlognFaster;
  t8 = t8 && okSeed;
  seedRows.push([
    `seed=${seed}`,
    String(consistent),
    `${cmps[0].toLocaleString()} -> ${cmps[1].toLocaleString()}`,
    `${movs[0].toLocaleString()} = ${movs[1].toLocaleString()}`,
    verdict(okSeed),
  ]);
}
console.log(`\n===== T8 多随机种子复现性验证（n=${n8}，3 组独立种子）=====`);
table(['随机种子', '八算法全一致', '直插->折半比较变化', '直插/折半移动相等', '判定'], seedRows);
console.log(`T8 更换随机参数后定性与量级结论恒成立 -> ${verdict(t8)}`);

// ---------- 【运行】随机数据八算法对比（支持单规模或 --multi 五档规模） ----------
const scalesToRun = MULTI_MODE ? [1000, 5000, 10000, 50000, 100000] : [SCALE];
for (const curScale of scalesToRun) {
  const randomData = Int32Array.from({ length: curScale }, (_, i) => ((i * 1103515245 + 12345) >>> 8) % curScale);
  const perfRows = [];
  for (let alg = 0; alg < 8; alg++) {
    load(randomData);
    const ok = sortOnce(alg, curScale);
    perfRows.push([NAMES[alg], e.elapsed_ms().toFixed(2), Number(e.comparisons()).toLocaleString(), Number(e.moves()).toLocaleString(), ok === 1 ? '通过' : '失败']);
  }
  console.log(`\n===== 附：n=${curScale.toLocaleString()} 随机数据八算法实测 =====`);
  table(['算法', '耗时(ms)', '比较次数', '移动次数', '有序性'], perfRows);
}

console.log(`\n总计：${failed === 0 ? 'T1~T8 全部用例通过' : failed + ' 项判定失败'}`);
process.exit(failed === 0 ? 0 : 1);
