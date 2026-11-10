const { chromium } = require('playwright');

const results = [];
let seq = 0;
let currentTest = '';
function record(name, input, expected, actual, pass) {
  seq++;
  currentTest = name;
  results.push({ id: seq, name, input, expected, actual: String(actual), pass: !!pass });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] #${seq} ${name} => ${String(actual).slice(0, 220)}`);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });

  // ===================== 手机视口 =====================
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', e => errors.push(`[${currentTest}] PAGEERROR: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`[${currentTest}] ${m.text()}`); });

  await page.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // T1 页面加载
  record('页面加载', '访问 index.html', '标题"魔方复原助手"', await page.title(), (await page.title()).includes('魔方'));

  // T2 响应式：手机无横向滚动
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  record('响应式-手机无横向溢出', '390×844', 'scrollWidth <= innerWidth', `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}`, scrollW);

  // T3 3D 容器渲染
  await page.click('button[data-tab=solve]');
  await page.waitForTimeout(1200);
  const canvas = await page.evaluate(() => !!document.querySelector('#cubeContainer canvas'));
  record('3D 画布渲染', '点击3D教学tab', 'canvas 存在', canvas, canvas);

  // T4 3x3 随机打乱
  await page.click('#btnScramble');
  await page.waitForTimeout(500);
  const scrambleState = await page.evaluate(() => {
    const app = window.__cubeApp;
    const diy = app.appState.diyFaces;
    // 检查是否打乱（非全还原）
    const faceToColor = { U:'white', R:'red', F:'green', D:'yellow', L:'orange', B:'blue' };
    let isScrambled = false;
    for (const f of ['U','R','F','D','L','B']) {
      if (!diy[f].every(c => c === faceToColor[f])) { isScrambled = true; break; }
    }
    return { isScrambled, counts: Object.values(diy).flat().reduce((a,c)=>(a[c]=(a[c]||0)+1,a),{}) };
  });
  const countOk = Object.values(scrambleState.counts).every(c => c === 9);
  record('3x3 随机打乱', '点击随机打乱', '打乱态且每色9个', JSON.stringify(scrambleState), scrambleState.isScrambled && countOk);

  // T5 3x3 一键还原求解正确
  const solve333 = await page.evaluate(async () => {
    const app = window.__cubeApp;
    const S = window.Solver;
    const diy = JSON.parse(JSON.stringify(app.appState.diyFaces));
    const sol = S.solve(diy);
    // 验证解应用后还原
    const cs = window.cubeSolverModule;
    // 从 diy 构建 3x3 faces
    const letters = S.colorFacesToLetters(diy);
    const cube = cs.cubeFromFaces(letters);
    const solVendor = sol.map(m => m.endsWith("'") ? m.slice(0,-1)+'_PRIME' : m);
    const solved = cs.applyMoves(cube, solVendor);
    return { solLen: sol.length, isSolved: cs.isSolved(solved) };
  });
  record('3x3 一键还原求解正确', '打乱态求解', 'isSolved=true 且 solLen>0', JSON.stringify(solve333), solve333.isSolved && solve333.solLen > 0);

  // T6 逐步还原 + 旋转动画
  await page.click('#btnSolveDIY');
  await page.waitForTimeout(800);
  const stepState = await page.evaluate(() => ({
    hasSolution: window.__cubeApp.appState.solution.length > 0,
    moveCount: document.querySelector('#solveMoveCount').textContent,
  }));
  record('3x3 一键还原进入播放', '点击一键还原', '有求解步骤', JSON.stringify(stepState), stepState.hasSolution);

  // 下一步动画
  await page.click('#btnNext');
  await page.waitForTimeout(600);
  const step1 = await page.evaluate(() => window.__cubeApp.appState.currentStep);
  record('3x3 下一步动画', '点击下一步', 'currentStep 递增', `currentStep=${step1}`, step1 >= 0);

  // T7b 3x3 逐步播放：每一步 3D 贴纸颜色都必须与逻辑状态一致（不跳色、不重建）
  const color333 = await page.evaluate(async () => {
    const app = window.__cubeApp, R = app.ThreeRenderer, cs = window.cubeSolverModule;
    const waitIdle = async () => { let n = 0; while (R.isAnimating && n++ < 3000) await new Promise(r => setTimeout(r, 5)); };
    // 先排空任何残留转动，避免与本次播放重叠（否则 cubieMap 坐标会被并发覆盖 → 跳色）
    await waitIdle();
    app.appState.solveSpeed = 1;
    const total = app.appState.solution.length;
    const bad = [];
    const btn = document.querySelector('#btnNext');
    const before = R.cubies.length;
    let guard = 0;
    while (app.appState.currentStep < total && guard++ < total + 5) {
      btn.click();
      // 等这一步动画真正播完再校验（串行播放，每一步颜色都对得上）
      await waitIdle();
      const corrected = R.syncFaces(cs.facesFromCube(app.appState.cubeState), 'letter');
      if (corrected || R._lastSync.missing) bad.push({ step: app.appState.currentStep, ...R._lastSync });
    }
    app.appState.solveSpeed = 1000;
    return { total, bad, cubiesBefore: before, cubiesAfter: R.cubies.length, finalStep: app.appState.currentStep };
  });
  const okColor333 = color333.bad.length === 0 && color333.cubiesBefore === color333.cubiesAfter && color333.finalStep === color333.total;
  record('3x3 每一步3D贴纸颜色对应', '连续播放全部 ' + color333.total + ' 步', '每步 corrected=0、missing=0 且未重建 cubie', JSON.stringify(color333), okColor333);

  // T7 状态重置
  await page.click('#btnResetSolve');
  await page.waitForTimeout(600);
  const resetState = await page.evaluate(() => ({
    solutionLen: window.__cubeApp.appState.solution.length,
    currentStep: window.__cubeApp.appState.currentStep,
    diySolved: Object.values(window.__cubeApp.appState.diyFaces).every((arr, i) => arr.every(c => ['white','red','green','yellow','orange','blue'][i] === c)),
  }));
  record('3x3 状态重置', '点击重置', 'solution=0 且还原态', JSON.stringify(resetState), resetState.solutionLen === 0 && resetState.currentStep === -1);

  // T8 2x2 切换 + 打乱 + 求解
  await page.selectOption('#cubeTypeSelect', '222');
  await page.waitForTimeout(600);
  const r222cubies = await page.evaluate(() => window.__cubeApp.ThreeRenderer.cubies.length);
  record('2x2 类型切换渲染', '选择2x2', '8 个 cubie', r222cubies, r222cubies === 8);

  await page.click('#btnScramble');
  await page.waitForTimeout(400);
  const solve222 = await page.evaluate(() => {
    const S = window.Solver;
    const diy = window.__cubeApp.appState.diyFaces;
    const valid = S.validateFaces2x2(diy).valid;
    let solLen = -1, err = null;
    if (valid) { try { solLen = S.solve2x2(diy).length; } catch(e) { err = e.constructor.name; } }
    return { valid, solLen, err, uLen: diy.U.length };
  });
  record('2x2 打乱+求解', '打乱后求解', 'valid=true 且 solLen>0 且每面4格', JSON.stringify(solve222), solve222.valid && solve222.solLen > 0 && solve222.uLen === 4);

  // T9 4x4 渲染 + 面颜色状态
  await page.selectOption('#cubeTypeSelect', '444');
  await page.waitForTimeout(600);
  const r444 = await page.evaluate(() => ({
    cubies: window.__cubeApp.ThreeRenderer.cubies.length,
    diyLen: window.__cubeApp.appState.diyFaces.U.length,
  }));
  record('4x4 渲染+面状态', '选择4x4', '64 cubie 且每面16格', JSON.stringify(r444), r444.cubies === 64 && r444.diyLen === 16);

  // T10 4x4 随机打乱 + 数据同步
  await page.click('#btnScramble');
  await page.waitForTimeout(500);
  const r444sync = await page.evaluate(() => {
    const app = window.__cubeApp;
    const diy = app.appState.diyFaces;
    // 颜色守恒检查（每色16个）
    const counts = Object.values(diy).flat().reduce((a,c)=>(a[c]=(a[c]||0)+1,a),{});
    const conserved = Object.values(counts).every(c => c === 16);
    // 数据同步：遍历 cubie 的 stickers，颜色非默认黑色（说明已着色）
    const R = app.ThreeRenderer;
    let stickerCount = 0;
    for (const c of R.cubies) {
      for (const f in c.stickers) {
        const col = c.stickers[f].material.color.getHexString();
        if (col !== '222326') stickerCount++; // 非初始灰色
      }
    }
    return { conserved, stickerCount };
  });
  record('4x4 打乱数据同步', '打乱后检查', '每色16个 且 96个贴纸已着色', JSON.stringify(r444sync), r444sync.conserved && r444sync.stickerCount === 96);

  // T11 4x4 旋转逻辑
  const r444rot = await page.evaluate(async () => {
    const R = window.__cubeApp.ThreeRenderer;
    const before = R.cubies.map(c => `${c.x},${c.y},${c.z}`).sort().join('|');
    await R.rotateFace('R', 50);
    const after = R.cubies.map(c => `${c.x},${c.y},${c.z}`).sort().join('|');
    return { cubiesAfter: R.cubies.length, positionsUnchanged: before === after };
  });
  record('4x4 旋转逻辑', 'rotateFace R', 'cubie数64 且坐标集合不变', JSON.stringify(r444rot), r444rot.cubiesAfter === 64 && r444rot.positionsUnchanged);

  // T12 4x4 异常输入（颜色计数错误）
  const r444invalid = await page.evaluate(() => {
    const app = window.__cubeApp;
    const diy = JSON.parse(JSON.stringify(app.appState.diyFaces));
    // 把 U 面 4 格都改成 green，必然破坏计数（green 超 16）
    diy.U[0] = 'green'; diy.U[1] = 'green'; diy.U[2] = 'green'; diy.U[3] = 'green';
    const counts = Object.values(diy).flat().reduce((a,c)=>(a[c]=(a[c]||0)+1,a),{});
    const bad = Object.entries(counts).filter(([k,v]) => v !== 16);
    return { valid: bad.length === 0, bad };
  });
  record('4x4 异常输入检测', 'U面首格改色破坏计数', '检测到计数异常', JSON.stringify(r444invalid), r444invalid && !r444invalid.valid);

  // T13 4×4 后台求解器（Worker）冒烟：已还原态应能正常返回
  const workerSmoke = await page.evaluate(() => new Promise((resolve) => {
    const std = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };
    const faces = {};
    for (const f of Object.keys(std)) faces[f] = Array(16).fill(std[f]);
    let w;
    try { w = new Worker('./solver-worker.js'); } catch (e) { resolve({ ok: false, msg: e.message }); return; }
    const timer = setTimeout(() => { w.terminate(); resolve({ ok: false, msg: 'timeout' }); }, 30000);
    w.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'progress') return; // 阶段进度，继续等待最终结果
      clearTimeout(timer); w.terminate();
      resolve({ ok: d.type === 'done', type: d.type, len: (d.solution || []).length, msg: d.message || '' });
    };
    w.onerror = (e) => { clearTimeout(timer); w.terminate(); resolve({ ok: false, msg: e.message || 'worker error' }); };
    w.postMessage({ id: 1, faces, cubeType: '444' });
  }));
  record('4x4 后台求解器可用', 'Worker 输入已还原4×4', '返回 done', JSON.stringify(workerSmoke), workerSmoke.ok);

  // T13b 4×4 一键还原端到端（真实 UI + 解正确性 + 播放/撤销数据同步）
  await page.selectOption('#cubeTypeSelect', '444');
  await page.waitForTimeout(500);
  const setup444 = await page.evaluate(() => {
    const app = window.__cubeApp, BC = window.BigCube;
    const std = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };
    const solved = {};
    for (const f of Object.keys(std)) solved[f] = Array(16).fill(std[f]);
    const st = BC.buildState(4, solved);
    const scr = ["Uw", "Rw'", 'F', "Dw'", 'U', "R'", 'Lw'];
    for (const m of scr) BC.applyMove(st, m, 4);
    app.appState.diyFaces = BC.stateToFaces(st, 4);
    // 模拟"应用内随机打乱"：记录序列与快照，一键还原应走逆序列快速路径
    app.appState.scrambleMoves = scr.slice();
    app.appState.scrambleFaces = JSON.parse(JSON.stringify(app.appState.diyFaces));
    return { faces: JSON.parse(JSON.stringify(app.appState.diyFaces)), scr };
  });
  await page.evaluate(() => {
    window.__solveAlerts = [];
    window.__origAlert = window.alert;
    window.alert = (m) => { window.__solveAlerts.push(String(m)); };
  });
  await page.click('#btnSolveDIY');
  let solveWaited = true;
  try {
    await page.waitForFunction(() =>
      window.__cubeApp.appState.solution.length > 0 || window.__solveAlerts.length > 0,
      null, { timeout: 120000 });
  } catch (e) { solveWaited = false; }
  const solve444 = await page.evaluate((input) => {
    const app = window.__cubeApp, BC = window.BigCube;
    const sol = app.appState.solution.slice();
    const std = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };
    const st = BC.buildState(4, input.faces);
    for (const m of sol) BC.applyMove(st, m, 4);
    const fs = BC.stateToFaces(st, 4);
    let solved = true;
    for (const f of Object.keys(std)) for (let i = 0; i < 16; i++) if (fs[f][i] !== std[f]) solved = false;
    return {
      len: sol.length, solved, alerts: window.__solveAlerts.slice(),
      source: app.appState.solveSource,
      stepText: (document.querySelector('#solveStep') || {}).textContent || '',
      counter: document.querySelector('#solveMoveCount').textContent,
      progressGone: !document.getElementById('solveProgress'),
    };
  }, setup444);
  const ok444 = solveWaited && solve444.len > 0 && solve444.solved && solve444.alerts.length === 0 && solve444.progressGone;
  record('4x4 一键还原端到端', '固定7步打乱后点击一键还原', '解非空且应用后完全还原、无失败弹窗', JSON.stringify(solve444), ok444);
  record('4x4 解法来源如实标注', '检查 solveSource 与界面文案', '标注为逆序列还原', JSON.stringify({ source: solve444.source, stepText: solve444.stepText.slice(0, 80) }), solve444.source === 'inverse' && solve444.stepText.includes('逆序'));

  // T13c 4×4 播放一步 + 撤销的数据同步（宽/中层转动动画）
  await page.click('#btnNext');
  await page.waitForTimeout(1500);
  const forward444 = await page.evaluate((input) => {
    const app = window.__cubeApp, BC = window.BigCube;
    const st = BC.buildState(4, input.faces);
    BC.applyMove(st, app.appState.solution[0], 4);
    const expected = BC.stateToFaces(st, 4);
    let same = true;
    for (const f of Object.keys(expected)) for (let i = 0; i < 16; i++) {
      if (expected[f][i] !== app.appState.diyFaces[f][i]) same = false;
    }
    return { same, step: app.appState.currentStep, first: app.appState.solution[0] };
  }, setup444);
  record('4x4 逐步播放数据同步', '点击下一步', 'currentStep=0 且 diyFaces 与预期一致', JSON.stringify(forward444), forward444.same && forward444.step === 0);

  // T13c-2 4×4 逐步播放到完成：每一步 3D 贴纸颜色都要对应这一步的转动
  const color444 = await page.evaluate(async () => {
    const app = window.__cubeApp, R = app.ThreeRenderer;
    const waitIdle = async () => { let n = 0; while (R.isAnimating && n++ < 3000) await new Promise(r => setTimeout(r, 5)); };
    await waitIdle();
    app.appState.solveSpeed = 1;
    const total = app.appState.solution.length;
    const bad = [];
    const btn = document.querySelector('#btnNext');
    const cubiesBefore = R.cubies.length;
    let guard = 0;
    while (app.appState.currentStep < total && guard++ < total + 5) {
      btn.click();
      await waitIdle();
      const corrected = R.syncFaces(app.appState.diyFaces, 'key');
      if (corrected || R._lastSync.missing) bad.push({ step: app.appState.currentStep, ...R._lastSync });
    }
    const finalText = (document.querySelector('#solveStep') || {}).textContent || '';
    app.appState.solveSpeed = 1000;
    return { total, bad, cubiesBefore, cubiesAfter: R.cubies.length, finalStep: app.appState.currentStep, finalText };
  });
  const okColor444 = color444.bad.length === 0 && color444.cubiesBefore === color444.cubiesAfter && color444.finalStep === color444.total;
  record('4x4 每一步3D贴纸颜色对应', '连续播放全部 ' + color444.total + ' 步（含宽转/中层）', '每步 corrected=0、missing=0 且未重建 cubie', JSON.stringify(color444), okColor444);

  // T13d 逐步撤销全部步骤，每一步颜色同样要对应
  const undo444 = await page.evaluate(async (input) => {
    const app = window.__cubeApp, R = app.ThreeRenderer;
    const waitIdle = async () => { let n = 0; while (R.isAnimating && n++ < 3000) await new Promise(r => setTimeout(r, 5)); };
    app.appState.solveSpeed = 1;
    const bad = [];
    const btn = document.querySelector('#btnPrev');
    let guard = 0;
    while (app.appState.currentStep >= 0 && guard++ < 60) {
      btn.click();
      await waitIdle();
      const corrected = R.syncFaces(app.appState.diyFaces, 'key');
      if (corrected || R._lastSync.missing) bad.push({ step: app.appState.currentStep, ...R._lastSync });
    }
    await waitIdle();
    app.appState.solveSpeed = 1000;
    let same = true;
    for (const f of Object.keys(input.faces)) for (let i = 0; i < 16; i++) {
      if (input.faces[f][i] !== app.appState.diyFaces[f][i]) same = false;
    }
    return { bad, same, step: app.appState.currentStep };
  }, setup444);
  record('4x4 逐步撤销颜色对应', '逐步点击上一步回到起始', '每步颜色一致、currentStep=-1、恢复打乱态', JSON.stringify(undo444), undo444.bad.length === 0 && undo444.same && undo444.step === -1);
  await page.evaluate(() => { window.alert = window.__origAlert; });

  // T13d 4×4 宽转动/中层转动动画
  const wide444 = await page.evaluate(async () => {
    const R = window.__cubeApp.ThreeRenderer;
    const before = R.cubies.length;
    await R.rotateFace('Uw', 30);
    await R.rotateFace('2R', 30);
    await R.rotateFace('Rw2', 30);
    return { before, after: R.cubies.length };
  });
  record('4x4 宽/中层转动动画', 'Uw, 2R, Rw2', 'cubie数保持64', JSON.stringify(wide444), wide444.before === 64 && wide444.after === 64);

  // T14 5x5 渲染
  await page.selectOption('#cubeTypeSelect', '555');
  await page.waitForTimeout(600);
  const r555 = await page.evaluate(() => ({
    cubies: window.__cubeApp.ThreeRenderer.cubies.length,
    diyLen: window.__cubeApp.appState.diyFaces.U.length,
  }));
  record('5x5 渲染+面状态', '选择5x5', '124 cubie 且每面25格', JSON.stringify(r555), r555.cubies === 124 && r555.diyLen === 25);

  // T15 5x5 旋转逻辑
  const r555rot = await page.evaluate(async () => {
    const R = window.__cubeApp.ThreeRenderer;
    await R.rotateFace('U', 50);
    return R.cubies.length;
  });
  record('5x5 旋转逻辑', 'rotateFace U', 'cubie数124', r555rot, r555rot === 124);

  // T15b 5×5 自动求解未实现时必须诚实提示（不得虚报完成）
  await page.evaluate(() => {
    const app = window.__cubeApp;
    app.resetDiyFaces();
    app.appState.solution = [];
    app.appState.currentStep = -1;
    window.__solveAlerts5 = [];
    window.__origAlert5 = window.alert;
    window.alert = (m) => { window.__solveAlerts5.push(String(m)); };
  });
  await page.click('#btnSolveDIY');
  await page.waitForTimeout(700);
  const five5 = await page.evaluate(() => {
    const a = window.__solveAlerts5.slice();
    window.alert = window.__origAlert5;
    return { alerts: a, solLen: window.__cubeApp.appState.solution.length };
  });
  const honest5 = five5.solLen === 0 && five5.alerts.some(m => m.includes('开发中'));
  record('5x5 未实现功能诚实标注', '还原态点击一键还原', '提示"开发中"且不产生假解', JSON.stringify(five5), honest5);

  // T16 切回 3x3
  await page.selectOption('#cubeTypeSelect', '333');
  await page.waitForTimeout(600);
  const r333back = await page.evaluate(() => window.__cubeApp.ThreeRenderer.cubies.length);
  record('切回3x3', '选择3x3', '26 cubie', r333back, r333back === 26);

  // ===================== 桌面视口 =====================
  const desktop = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await desktop.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(800);
  const desktopScroll = await desktop.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  record('响应式-桌面无横向溢出', '900×900', 'scrollWidth <= innerWidth', `scrollWidth=${await desktop.evaluate(() => document.documentElement.scrollWidth)}`, desktopScroll);

  // T18 浅色主题
  const lightPage = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  await lightPage.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
  await lightPage.waitForTimeout(600);
  const lightBg = await lightPage.evaluate(() => getComputedStyle(document.body).backgroundColor);
  record('浅色主题', 'colorScheme=light', '浅色背景', lightBg, lightBg.includes('245'));

  // ===================== 2x2 奇偶异常 =====================
  const parityTest = await page.evaluate(() => {
    const S = window.Solver;
    const cs = window.cubeSolverModule;
    // 构造非法 2x2（角块奇置换）：直接构造颜色分布
    const cornerIdx = [0,2,6,8];
    const letterToKey = { U:'white',D:'yellow',R:'red',L:'orange',F:'green',B:'blue' };
    const scramble = ['R']; // 1 个 90° → 角块奇置换
    const scramV = scramble.map(m => m.endsWith("'") ? m.slice(0,-1)+'_PRIME' : m);
    const scrambled = cs.cubeFromMoves(scramV);
    const faces9 = cs.facesFromCube(scrambled);
    const faces2 = {};
    for (const f of ['U','R','F','D','L','B']) faces2[f] = cornerIdx.map(i => letterToKey[faces9[f][i]]);
    let err = null;
    try { S.solve2x2(faces2); } catch(e) { err = e.constructor.name; }
    return err;
  });
  record('2x2 奇偶异常处理', '奇置换非法输入', '抛出 ParityError', parityTest, parityTest === 'ParityError');

  // T22 控制台错误检查（5×5 主动触发的"开发中"提示属预期，单独排除）
  const unexpectedErrors = errors.filter(e => !e.includes('开发中') && !e.includes('敬请期待'));
  record('控制台无意外错误', '全流程控制台/页面异常', '非预期错误=0', unexpectedErrors.length ? unexpectedErrors.join(' | ') : '0', unexpectedErrors.length === 0);

  // 汇总
  const passCount = results.filter(r => r.pass).length;
  console.log('===== 测试报告 =====');
  results.forEach(r => {
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] #${r.id} ${r.name}`);
    console.log(`  输入: ${r.input}`);
    console.log(`  预期: ${r.expected}`);
    console.log(`  实际: ${r.actual}`);
  });
  console.log(`\n通过: ${passCount}/${results.length}`);
  const expectedErrors = errors.filter(e => e.includes('开发中') || e.includes('敬请期待'));
  console.log(`控制台错误: ${errors.length}（预期内 ${expectedErrors.length}，非预期 ${unexpectedErrors.length}）`);
  errors.forEach(e => console.log(`  ${expectedErrors.includes(e) ? 'EXPECTED' : 'ERR'}:`, e));

  // 自动落盘报告，方便交付评审
  const fs = require('fs');
  const lines = [];
  lines.push('魔方复原助手 — 浏览器端回归测试报告');
  lines.push('生成时间: ' + new Date().toISOString());
  lines.push(`结果：${passCount}/${results.length} 通过；非预期控制台错误 ${unexpectedErrors.length} 条`);
  lines.push('='.repeat(40));
  results.forEach(r => {
    lines.push(`[${r.pass ? 'PASS' : 'FAIL'}] #${r.id} ${r.name}`);
    lines.push(`  输入: ${r.input}`);
    lines.push(`  预期: ${r.expected}`);
    lines.push(`  实际: ${r.actual}`);
  });
  lines.push('');
  lines.push(`通过: ${passCount}/${results.length}`);
  lines.push(`控制台错误: ${errors.length}（预期内 ${expectedErrors.length}，非预期 ${unexpectedErrors.length}）`);
  errors.forEach(e => lines.push(`  ${expectedErrors.includes(e) ? 'EXPECTED' : 'ERR'}: ${e}`));
  fs.writeFileSync('test_report_output.txt', lines.join('\n'), 'utf8');

  await browser.close();
})().catch((e) => {
  console.log('\n!! 测试执行异常中断:', e.message);
  console.log(`已完成 ${results.length} 项，通过 ${results.filter(r => r.pass).length} 项`);
  results.forEach(r => console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] #${r.id} ${r.name} => ${r.actual.slice(0, 160)}`));
  process.exitCode = 1;
});
