/**
 * bigcube.js — 高阶魔方（4×4 / 5×5）降阶法求解
 *
 * 核心思路（Reduction Method）：
 *   1. 中心配对：把每面的中心块配成同色
 *   2. 棱块配对：把每边的棱块配成一对
 *   3. 降阶成 3×3，用 Kociemba 求解
 *   4. 处理 parity（4×4 特有）
 *
 * 状态表示：每个贴纸 { x, y, z, face, color }
 *   - (x,y,z) 是贴纸所在块的 3D 坐标（半整数，如 4×4 为 ±1.5/±0.5）
 *   - face 是贴纸朝向的面（'U'/'D'/'R'/'L'/'F'/'B'）
 *   - color 是颜色 key（'white'/'yellow'/...）
 */

const BigCube = (() => {
  const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
  const COLOR_TO_FACE = { white: 'U', yellow: 'D', red: 'R', orange: 'L', green: 'F', blue: 'B' };
  const FACE_TO_COLOR = { U: 'white', D: 'yellow', R: 'red', L: 'orange', F: 'green', B: 'blue' };

  // 面法线单位向量
  const FACE_NORMAL = {
    U: [0, 1, 0], D: [0, -1, 0],
    R: [1, 0, 0], L: [-1, 0, 0],
    F: [0, 0, 1], B: [0, 0, -1],
  };

  // 法线向量 -> 面 的查表（避免 normalToFace 每次线性扫描 6 个面）
  const NORMAL_TO_FACE = {};
  for (const f of FACE_ORDER) {
    NORMAL_TO_FACE[FACE_NORMAL[f].map(v => Math.round(v)).join(',')] = f;
  }

  // 生成 N×N 面贴纸坐标（"直视该面，左上到右下"），与 app.js 一致
  const _facePosCache = {};
  function faceStickerPos(n) {
    if (_facePosCache[n]) return _facePosCache[n];
    const max = (n - 1) / 2;
    const asc = [];
    for (let i = 0; i < n; i++) asc.push(-max + i);
    const desc = [...asc].reverse();
    const rules = {
      U: (r, c) => [asc[c], max, asc[r]],
      D: (r, c) => [asc[c], -max, desc[r]],
      R: (r, c) => [max, desc[r], desc[c]],
      L: (r, c) => [-max, desc[r], asc[c]],
      F: (r, c) => [asc[c], desc[r], max],
      B: (r, c) => [desc[c], desc[r], -max],
    };
    const pos = {};
    for (const face of FACE_ORDER) {
      pos[face] = [];
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) pos[face].push(rules[face](r, c));
      }
    }
    _facePosCache[n] = pos;
    return pos;
  }

  /**
   * 从 6 面颜色网格构建贴纸状态
   * @param {number} n 阶数
   * @param {Object} colorFaces { U: [n² colorKey], R: [...], ... }
   * @returns {Array} 96 个贴纸 { x, y, z, face, color }
   */
  function buildState(n, colorFaces) {
    const pos = faceStickerPos(n);
    const stickers = [];
    for (const face of FACE_ORDER) {
      const colors = colorFaces[face];
      for (let i = 0; i < n * n; i++) {
        const [x, y, z] = pos[face][i];
        stickers.push({ x, y, z, face, color: colors[i] });
      }
    }
    return stickers;
  }

  // 绕坐标轴旋转向量（angle 为弧度，顺时针为正，从轴正方向看）
  function rotateVec(v, axis, angle) {
    const [x, y, z] = v;
    const c = Math.cos(angle), s = Math.sin(angle);
    if (axis === 'x') return [x, y * c + z * s, -y * s + z * c];
    if (axis === 'y') return [x * c - z * s, y, x * s + z * c];
    if (axis === 'z') return [x * c + y * s, -x * s + y * c, z];
    return [x, y, z];
  }

  // 顺时针 90° 坐标变换（整数格点，避免浮点）
  function rot90(v, axis, dir) {
    // dir: 1 顺时针, -1 逆时针
    let [x, y, z] = v;
    if (axis === 'x') { if (dir === 1) [y, z] = [z, -y]; else [y, z] = [-z, y]; }
    else if (axis === 'y') { if (dir === 1) [x, z] = [-z, x]; else [x, z] = [z, -x]; }
    else if (axis === 'z') { if (dir === 1) [x, y] = [y, -x]; else [x, y] = [-y, x]; }
    return [x, y, z];
  }

  /**
   * 转动一层（原地修改状态）
   * @param {Array} state 贴纸数组
   * @param {string} axis 'x'/'y'/'z'
   * @param {number} layer 该轴坐标值（半整数）
   * @param {number} dir 1 顺时针 / -1 逆时针 / 2 表示 180°
   */
  function rotateLayer(state, axis, layer, dir) {
    const eps = 1e-9;
    for (const s of state) {
      // 判断贴纸是否在该层
      let inLayer = false;
      if (axis === 'x' && Math.abs(s.x - layer) < eps) inLayer = true;
      else if (axis === 'y' && Math.abs(s.y - layer) < eps) inLayer = true;
      else if (axis === 'z' && Math.abs(s.z - layer) < eps) inLayer = true;
      if (!inLayer) continue;

      const times = dir === 2 ? 2 : 1;
      let [x, y, z] = [s.x, s.y, s.z];
      let [nx, ny, nz] = FACE_NORMAL[s.face];
      const d = dir === -1 ? -1 : 1; // 逆时针 = 反向转
      for (let t = 0; t < times; t++) {
        [x, y, z] = rot90([x, y, z], axis, d);
        [nx, ny, nz] = rot90([nx, ny, nz], axis, d);
      }
      s.x = x; s.y = y; s.z = z;
      // 根据新法线更新 face
      s.face = normalToFace([nx, ny, nz]);
    }
  }

  function normalToFace(n) {
    return NORMAL_TO_FACE[[Math.round(n[0]), Math.round(n[1]), Math.round(n[2])].join(',')] || 'U';
  }

  // 解析转动记法（支持外层 + 中层）：如 'U', "R'", 'F2', '2R', "2R'", 'Rw'（宽转动）
  const _moveParseCache = {};
  function applyMove(state, move, n) {
    const max = (n - 1) / 2;
    // 记法解析较频繁（求解期成千上万次），缓存解析结果
    let p = _moveParseCache[move];
    if (!p) {
      const face = move.replace(/2|'|w/g, '').replace(/^[A-Za-z]/, m => m.toUpperCase());
      p = {
        has2Prefix: /^2/.test(move),
        hasW: /w/i.test(move),
        prime: move.endsWith("'"),
        double: move.endsWith('2'),
        baseFace: face[0] || face,
      };
      _moveParseCache[move] = p;
    }
    const { has2Prefix, hasW, prime, double, baseFace } = p;
    const dir = double ? 2 : (prime ? -1 : 1);

    // 基础面 → 轴
    const axisMap = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };
    const dirMap = { U: 1, D: -1, R: 1, L: -1, F: 1, B: -1 };
    const axis = axisMap[baseFace];
    const faceDir = dirMap[baseFace];

    // 计算层坐标
    let layer;
    if (hasW) {
      // 宽转动：外层 + 相邻层，需要转多层
      const outerLayer = faceDir * max;
      // 宽转动 = 外层 + 第2层（对 4×4）
      rotateLayer(state, axis, outerLayer, dir);
      rotateLayer(state, axis, faceDir * (max - 1), dir);
      return;
    }
    if (has2Prefix) {
      // 中层转动（2R 等）：第2层
      layer = faceDir * (max - 1);
    } else {
      // 外层转动
      layer = faceDir * max;
    }
    rotateLayer(state, axis, layer, dir);
  }

  // 从状态提取 6 面颜色网格（用于展示/调试）
  function stateToFaces(state, n) {
    const pos = faceStickerPos(n);
    const faces = {};
    for (const face of FACE_ORDER) faces[face] = new Array(n * n).fill(null);
    // 遍历贴纸，按坐标匹配
    for (const s of state) {
      const facePos = pos[s.face];
      for (let i = 0; i < n * n; i++) {
        const [x, y, z] = facePos[i];
        if (Math.abs(x - s.x) < 1e-9 && Math.abs(y - s.y) < 1e-9 && Math.abs(z - s.z) < 1e-9) {
          faces[s.face][i] = s.color;
          break;
        }
      }
    }
    return faces;
  }

  // ==================== 中心块 / 棱块提取 ====================
  // 提取中心块（坐标有两个分量 ±0.5）：每个 { x, y, z, color }
  function extractCenters(state, n) {
    const half = 0.5;
    const eps = 1e-9;
    const centers = [];
    for (const s of state) {
      const coords = [Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)];
      const outerCount = coords.filter(c => Math.abs(c - (n - 1) / 2) < eps).length;
      // 中心块：恰有一个外层分量
      if (outerCount === 1) {
        centers.push({ x: s.x, y: s.y, z: s.z, color: s.color });
      }
    }
    return centers;
  }

  // 提取棱块（坐标恰有两个外层分量）：每边 2 个，共 24 个，配成 12 对
  function extractEdges(state, n) {
    const eps = 1e-9;
    const outer = (n - 1) / 2;
    const edges = [];
    for (const s of state) {
      const coords = [Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)];
      const outerCount = coords.filter(c => Math.abs(c - outer) < eps).length;
      if (outerCount === 2) {
        edges.push({ x: s.x, y: s.y, z: s.z, face: s.face, color: s.color });
      }
    }
    // 配对：同一边（两个外层分量符号相同）的两个贴纸
    const pairs = [];
    const used = new Set();
    for (let i = 0; i < edges.length; i++) {
      if (used.has(i)) continue;
      const e1 = edges[i];
      // 找同一边的另一个贴纸（两个外层分量坐标相同，内层分量互补 ±0.5）
      for (let j = i + 1; j < edges.length; j++) {
        if (used.has(j)) continue;
        const e2 = edges[j];
        if (sameEdge(e1, e2, outer)) {
          pairs.push({ a: e1, b: e2 });
          used.add(i); used.add(j);
          break;
        }
      }
    }
    return pairs;
  }

  function sameEdge(e1, e2, outer) {
    const eps = 1e-9;
    // 两个外层分量相同，内层分量互补
    let outerSame = 0, innerComplement = 0;
    for (const k of ['x', 'y', 'z']) {
      const v1 = e1[k], v2 = e2[k];
      if (Math.abs(Math.abs(v1) - outer) < eps && Math.abs(Math.abs(v2) - outer) < eps && Math.abs(v1 - v2) < eps) outerSame++;
      else if (Math.abs(v1 + v2) < eps && Math.abs(Math.abs(v1) - 0.5) < eps) innerComplement++;
    }
    return outerSame === 2 && innerComplement === 1;
  }

  // ==================== 中心配对（BFS） ====================
  // 状态编码：按"面"分组，每面颜色排序（忽略面内位置，因为外层转动只改变面内位置不改变面归属）
  function centerKey(centers, n) {
    const outer = (n - 1) / 2;
    const eps = 1e-9;
    const groups = { U: [], D: [], R: [], L: [], F: [], B: [] };
    for (const c of centers) {
      let key;
      if (Math.abs(c.y - outer) < eps) key = 'U';
      else if (Math.abs(c.y + outer) < eps) key = 'D';
      else if (Math.abs(c.x - outer) < eps) key = 'R';
      else if (Math.abs(c.x + outer) < eps) key = 'L';
      else if (Math.abs(c.z - outer) < eps) key = 'F';
      else key = 'B';
      groups[key].push(c.color);
    }
    return ['U', 'D', 'R', 'L', 'F', 'B'].map(f => groups[f].sort().join('')).join('|');
  }

  function centersSolved(centers, n) {
    const outer = (n - 1) / 2;
    const eps = 1e-9;
    // 按外层分量分组，检查每组 4 个同色
    const groups = {};
    for (const c of centers) {
      let key;
      if (Math.abs(c.y - outer) < eps) key = 'U';
      else if (Math.abs(c.y + outer) < eps) key = 'D';
      else if (Math.abs(c.x - outer) < eps) key = 'R';
      else if (Math.abs(c.x + outer) < eps) key = 'L';
      else if (Math.abs(c.z - outer) < eps) key = 'F';
      else key = 'B';
      (groups[key] = groups[key] || []).push(c.color);
    }
    for (const k of Object.keys(groups)) {
      const arr = groups[k];
      if (arr.length !== 4) return false;
      if (!arr.every(c => c === arr[0])) return false;
    }
    return true;
  }

  // 中心块级转动（绕轴旋转坐标）
  function rotateCenters(centers, axis, layer, dir, n) {
    const eps = 1e-9;
    const result = centers.map(c => ({ ...c }));
    for (const c of result) {
      let inLayer = false;
      if (axis === 'x' && Math.abs(c.x - layer) < eps) inLayer = true;
      else if (axis === 'y' && Math.abs(c.y - layer) < eps) inLayer = true;
      else if (axis === 'z' && Math.abs(c.z - layer) < eps) inLayer = true;
      if (!inLayer) continue;
      const times = dir === 2 ? 2 : 1;
      const d = dir === -1 ? -1 : 1;
      let [x, y, z] = [c.x, c.y, c.z];
      for (let t = 0; t < times; t++) [x, y, z] = rot90([x, y, z], axis, d);
      c.x = x; c.y = y; c.z = z;
    }
    return result;
  }

  // 所有转动动作（外层 + 中层）
  function allMoves(n) {
    const max = (n - 1) / 2;
    const base = [
      { axis: 'y', layer: max, face: 'U' },
      { axis: 'y', layer: -max, face: 'D' },
      { axis: 'x', layer: max, face: 'R' },
      { axis: 'x', layer: -max, face: 'L' },
      { axis: 'z', layer: max, face: 'F' },
      { axis: 'z', layer: -max, face: 'B' },
      // 中层（2U/2D/2R/2L/2F/2B）
      { axis: 'y', layer: max - 1, face: '2U' },
      { axis: 'y', layer: -(max - 1), face: '2D' },
      { axis: 'x', layer: max - 1, face: '2R' },
      { axis: 'x', layer: -(max - 1), face: '2L' },
      { axis: 'z', layer: max - 1, face: '2F' },
      { axis: 'z', layer: -(max - 1), face: '2B' },
    ];
    const moves = [];
    for (const b of base) {
      moves.push({ ...b, dir: 1, name: b.face });
      moves.push({ ...b, dir: -1, name: b.face + "'" });
      moves.push({ ...b, dir: 2, name: b.face + '2' });
    }
    return moves;
  }

  // ==================== 中心配对（整数数组 + 预计算置换，高效版） ====================
  // 24 个中心块坐标用 ×2 整数表示（±1, ±3），转动用预计算置换，BFS 状态用 Uint8Array
  const centerSolverCache = {};

  function getCenterSolver(n) {
    const key = String(n);
    if (centerSolverCache[key]) return centerSolverCache[key];
    const max = n - 1; // 1.5×2=3
    const half = 1;    // 0.5×2=1
    const coords = [];
    for (const [ax, av] of [['x', max], ['x', -max], ['y', max], ['y', -max], ['z', max], ['z', -max]]) {
      const inner = ['x', 'y', 'z'].filter(a => a !== ax);
      for (const i1 of [half, -half]) for (const i2 of [half, -half]) {
        const c = { x: 0, y: 0, z: 0 };
        c[ax] = av; c[inner[0]] = i1; c[inner[1]] = i2;
        coords.push(c);
      }
    }
    const coordKey = (c) => c.x + ',' + c.y + ',' + c.z;
    const idxMap = {};
    coords.forEach((c, i) => idxMap[coordKey(c)] = i);

    function rotInt(c, axis, dir) {
      let x = c.x, y = c.y, z = c.z;
      if (axis === 'x') { if (dir === 1) { y = c.z; z = -c.y; } else { y = -c.z; z = c.y; } }
      else if (axis === 'y') { if (dir === 1) { x = -c.z; z = c.x; } else { x = c.z; z = -c.x; } }
      else { if (dir === 1) { x = c.y; y = -c.x; } else { x = -c.y; y = c.x; } }
      return { x, y, z };
    }

    // 每个转动的置换：perm[i] = 位置 i 的新块来源位置
    // 外层转动（U/D/R/L/F/B，外层坐标 ±max）+ 中层转动（2U/2D/2R/2L/2F/2B，内层坐标 ±half）
    const moveDefs = {
      U: ['y', max], D: ['y', -max], R: ['x', max], L: ['x', -max], F: ['z', max], B: ['z', -max],
      '2R': ['x', half], '2L': ['x', -half], '2F': ['z', half], '2B': ['z', -half], '2U': ['y', half], '2D': ['y', -half],
    };
    const moves = [];
    for (const [name, def] of Object.entries(moveDefs)) {
      for (const [dir, suffix] of [[1, ''], [-1, "'"]]) {
        const perm = new Int8Array(24);
        for (let i = 0; i < 24; i++) {
          const c = coords[i];
          if (c[def[0]] === def[1]) {
            const src = rotInt(c, def[0], -dir); // 逆时针找来源
            perm[i] = idxMap[coordKey(src)];
          } else {
            perm[i] = i;
          }
        }
        moves.push({ name: name + suffix, perm, axis: def[0] });
      }
    }

    // 每个面的 4 个中心块索引
    const faceIdx = {};
    const faceAxisVal = { U: ['y', max], D: ['y', -max], R: ['x', max], L: ['x', -max], F: ['z', max], B: ['z', -max] };
    for (const [face, [ax, av]] of Object.entries(faceAxisVal)) {
      faceIdx[face] = [];
      coords.forEach((c, i) => { if (c[ax] === av) faceIdx[face].push(i); });
    }

    // 每个面的 2 个半中心（各 2 个槽位索引），按"配对中层转动"的轴分组
    const halfCenters = {};
    const groupAxis = { U: 'x', D: 'x', F: 'y', B: 'y', R: 'z', L: 'z' };
    for (const face of FACE_ORDER) {
      const ga = groupAxis[face];
      halfCenters[face] = [[], []];
      for (const i of faceIdx[face]) {
        if (coords[i][ga] === half) halfCenters[face][0].push(i);
        else halfCenters[face][1].push(i);
      }
    }

    centerSolverCache[key] = { coords, idxMap, moves, faceIdx, halfCenters };
    return centerSolverCache[key];
  }

  function applyPerm(state, perm) {
    const next = new Uint8Array(24);
    for (let i = 0; i < 24; i++) next[i] = state[perm[i]];
    return next;
  }

  // 中心配对：分三对相对面（U+D、F+B、R+L），每对用 BFS（整数数组 + 置换）
  function solveCenters(state, n, variantHint) {
    const tStart = Date.now();
    const solver = getCenterSolver(n);
    const COLOR_MAP = { white: 0, yellow: 1, red: 2, orange: 3, green: 4, blue: 5 };
    const colorIdx = { U: 0, D: 1, F: 4, B: 5, R: 2, L: 3 };

    // 从贴纸状态提取中心块颜色数组（Uint8Array(24)，按固定坐标顺序）
    const centers = extractCenters(state, n);
    const startArr = new Uint8Array(24);
    for (const c of centers) {
      const idx = solver.idxMap[(c.x * 2) + ',' + (c.y * 2) + ',' + (c.z * 2)];
      if (idx !== undefined) startArr[idx] = COLOR_MAP[c.color] ?? 0;
    }

    // 首选：确定性逐槽插入（多项式时间、有界）。逐个把正确颜色的中心块搬到目标槽位，
    // 保护已完成的面；最后一面由颜色守恒自动完成。这对任意打乱都稳定，不依赖深搜索。
    const greedy = solveCentersGreedy(startArr, solver, colorIdx);
    if (greedy) {
      for (const name of greedy) applyMove(state, name, n);
      return greedy;
    }

    // 在纯数组上求解（不改动 state），成功后一次性应用动作；失败可干净重试
    const attempt = (faceOrder, variant) => {
      const solution = [];
      let arr = startArr;
      const solvedFaces = [];
      for (const [faceA, faceB] of faceOrder) {
        if (Date.now() - tStart > 15000) return null; // 单个策略的时间预算，避免个别打乱拖死
        const cA = colorIdx[faceA], cB = colorIdx[faceB];
        const isGoal = (a) => {
          if (!solver.faceIdx[faceA].every(i => a[i] === cA)) return false;
          if (!solver.faceIdx[faceB].every(i => a[i] === cB)) return false;
          for (const f of solvedFaces) {
            if (!solver.faceIdx[f].every(i => a[i] === colorIdx[f])) return false;
          }
          return true;
        };
        if (isGoal(arr)) { solvedFaces.push(faceA, faceB); continue; }

        const pairAxis = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' }[faceA];
        const otherAxes = ['x', 'y', 'z'].filter(a => a !== pairAxis);
        // 动作：另外两个轴的中层 + 该轴的外层（12 个，减少搜索空间）
        const mv = solver.moves.filter(m => {
          if (m.name.startsWith('2')) return otherAxes.includes(m.axis);
          return m.axis === pairAxis;
        });
        // 启发式：该对两个面的错色块数 / 2（每次转动最多修正 2 个错色块）
        const h = (a) => {
          let wrong = 0;
          for (const i of solver.faceIdx[faceA]) if (a[i] !== cA) wrong++;
          for (const i of solver.faceIdx[faceB]) if (a[i] !== cB) wrong++;
          return Math.ceil(wrong / 2);
        };

        // 1) 多个"交换守恒"具体目标做双向 BFS（最快）
        let steps = null;
        for (const t of buildPairTargets(arr, solver, faceA, faceB, solvedFaces, colorIdx, variant)) {
          steps = biBfs(arr, t, mv, 5, 1500000);
          if (steps) break;
        }
        // 2) 有节点预算的浅层 BFS（目标为谓词，命中面更广）
        if (!steps) steps = bfsPair(arr, isGoal, mv, 6, 300000);
        // 3) 有节点预算的 IDA*（处理深打乱，绝不无限展开）
        if (!steps) steps = idaStarPair(arr, isGoal, mv, h, 14, 6000000);

        // 某对暂时无解时不立即放弃：后续对的 isGoal 会把这些面一起纳入约束，
        // 常常能在下一步一并解开（与原实现一致）。最终统一校验保证正确性。
        if (steps) {
          for (const name of steps) {
            const m = solver.moves.find(x => x.name === name);
            arr = applyPerm(arr, m.perm);
            solution.push(name);
          }
        }
        solvedFaces.push(faceA, faceB);
      }
      // 六个面全部标准才算成功；否则交给外层换策略重试
      const allOk = ['U', 'D', 'F', 'B', 'R', 'L'].every(f =>
        solver.faceIdx[f].every(i => arr[i] === colorIdx[f]));
      return allOk ? solution : null;
    };

    // 面顺序 / 目标构造变体重试，避免单一策略卡在个别打乱上
    const orders = [
      [['U', 'D'], ['F', 'B'], ['R', 'L']],
      [['F', 'B'], ['U', 'D'], ['R', 'L']],
      [['R', 'L'], ['U', 'D'], ['F', 'B']],
    ];
    let solution = null;
    const hint = ((variantHint || 0) % 3 + 3) % 3;
    for (let k = 0; k < 3 && !solution; k++) {
      const v = (hint + k) % 3;
      for (const order of orders) {
        solution = attempt(order, v);
        if (solution) break;
      }
    }
    if (!solution) throw new Error('中心配对未能在有限步内完成，请重试或重新打乱');
    for (const name of solution) applyMove(state, name, n);
    return solution;
  }

  // 确定性逐槽插入：用 12 个中层转动，逐个把目标色块搬进槽位，保护已完成的面
  function solveCentersGreedy(startArr, solver, colorIdx) {
    const byName = Object.fromEntries(solver.moves.map(m => [m.name, m]));
    const mid = solver.moves.filter(m => m.name.startsWith('2'));
    const faces = ['U', 'D', 'F', 'B', 'R', 'L'];
    const enc = (a) => { let k = 0n; for (let i = 0; i < 24; i++) k = k * 6n + BigInt(a[i]); return k; };
    const inv = (nm) => nm.endsWith("'") ? nm.slice(0, -1) : nm + "'";
    let arr = startArr;
    const steps = [];
    const solvedFaces = [];
    const keepSolved = (a) => solvedFaces.every(f => solver.faceIdx[f].every(i => a[i] === colorIdx[f]));
    for (let fi = 0; fi < 5; fi++) {
      const f = faces[fi], c = colorIdx[f];
      for (const slot of solver.faceIdx[f]) {
        if (arr[slot] === c) continue;
        const sk = enc(arr);
        const parent = new Map(); parent.set(sk, null);
        const queue = [{ a: arr, k: sk, d: 0, last: '' }];
        let head = 0, gk = -1n;
        while (head < queue.length && gk < 0n) {
          if (parent.size > 120000) break;
          const { a: cur, k, d, last } = queue[head++];
          if (d >= 5) continue;
          for (const m of mid) {
            if (m.name === inv(last)) continue;
            const na = applyPerm(cur, m.perm);
            if (!keepSolved(na)) continue;
            const nk = enc(na);
            if (parent.has(nk)) continue;
            parent.set(nk, { pk: k, mv: m.name });
            if (na[slot] === c) { gk = nk; break; }
            queue.push({ a: na, k: nk, d: d + 1, last: m.name });
          }
        }
        if (gk < 0n) return null;
        const path = []; let k = gk;
        while (parent.get(k)) { const p = parent.get(k); path.unshift(p.mv); k = p.pk; }
        for (const nm of path) { arr = applyPerm(arr, byName[nm].perm); steps.push(nm); }
      }
      solvedFaces.push(f);
    }
    const allOk = faces.every(f => solver.faceIdx[f].every(i => arr[i] === colorIdx[f]));
    return allOk ? steps : null;
  }

  // 构造"单面"的交换目标：face 标准 + 保护面标准 + 其他面交换守恒
  function buildFaceTarget(arr, solver, face, protectedFaces, colorIdx) {
    return buildPairTarget(arr, solver, face, face, protectedFaces, colorIdx);
  }

  // 构造目标数组：face + 已配对的面设为标准色，其他面的标准色块交换（颜色守恒）
  // 构造"配对相对面"的交换目标：faceA/faceB 标准 + 保护面标准 + 其他面交换守恒（允许 faceA/faceB 间交换）
  function buildPairTarget(arr, solver, faceA, faceB, protectedFaces, colorIdx) {
    const result = new Uint8Array(arr);
    const targets = [faceA, faceB, ...protectedFaces];
    for (const f of targets) {
      const tc = colorIdx[f];
      for (const i of solver.faceIdx[f]) {
        if (result[i] === tc) continue;
        for (let j = 0; j < 24; j++) {
          if (result[j] === tc && !solver.faceIdx[f].includes(j)) {
            result[j] = result[i];
            result[i] = tc;
            break;
          }
        }
      }
    }
    return result;
  }

  // 生成多个合法的"交换守恒"目标：交换哪些同色块有多种选择，任一可达即可，
  // 多试几个能显著提高双向 BFS 命中率，避免退化到昂贵的 IDA*。
  function buildPairTargets(arr, solver, faceA, faceB, protectedFaces, colorIdx, variant) {
    const results = [];
    for (let v = 0; v < 3; v++) {
      const result = new Uint8Array(arr);
      const targets = [faceA, faceB, ...protectedFaces];
      const order = ((variant + v) % 2 === 0) ? targets : [...targets].reverse();
      for (const f of order) {
        const tc = colorIdx[f];
        const slots = ((variant + v) % 2 === 0) ? solver.faceIdx[f] : [...solver.faceIdx[f]].reverse();
        for (const i of slots) {
          if (result[i] === tc) continue;
          const js = [];
          for (let j = 0; j < 24; j++) {
            if (result[j] === tc && !solver.faceIdx[f].includes(j)) js.push(j);
          }
          if (!js.length) continue;
          const j = js[(variant + v) % js.length];
          result[j] = result[i];
          result[i] = tc;
        }
      }
      results.push(result);
    }
    return results;
  }

  // 双向 BFS：从 start 到 target，返回动作序列（BigInt key）
  function biBfs(startArr, targetArr, moves, maxDepth, nodeBudget) {
    const startKey = encodeArr(startArr);
    const targetKey = encodeArr(targetArr);
    if (startKey === targetKey) return [];

    const invert = (name) => name.endsWith("'") ? name.slice(0, -1) : name + "'";

    const fwd = new Map(); fwd.set(startKey, []);
    const bwd = new Map(); bwd.set(targetKey, []);
    let fwdQueue = [{ arr: startArr, path: [] }];
    let bwdQueue = [{ arr: targetArr, path: [] }];

    const budget = nodeBudget || Infinity;
    for (let depth = 0; depth < maxDepth; depth++) {
      const newFwd = [];
      for (const node of fwdQueue) {
        if (fwd.size + bwd.size > budget) return null;
        for (const m of moves) {
          const next = applyPerm(node.arr, m.perm);
          const k = encodeArr(next);
          if (fwd.has(k)) continue;
          const path = [...node.path, m.name];
          if (bwd.has(k)) return path.concat(bwd.get(k).slice().reverse().map(invert));
          fwd.set(k, path);
          newFwd.push({ arr: next, path });
        }
      }
      fwdQueue = newFwd;

      const newBwd = [];
      for (const node of bwdQueue) {
        if (fwd.size + bwd.size > budget) return null;
        for (const m of moves) {
          const next = applyPerm(node.arr, m.perm);
          const k = encodeArr(next);
          if (bwd.has(k)) continue;
          const path = [...node.path, m.name];
          if (fwd.has(k)) return fwd.get(k).concat(path.slice().reverse().map(invert));
          bwd.set(k, path);
          newBwd.push({ arr: next, path });
        }
      }
      bwdQueue = newBwd;
    }
    return null;
  }

  // IDA*：迭代加深搜索（带节点预算，保证有界时间）
  function idaStarPair(startArr, isGoal, moves, h, maxDepth, nodeBudget) {
    const budget = { left: nodeBudget || 120000 };
    for (let depth = 1; depth <= maxDepth; depth++) {
      if (budget.left <= 0) return null;
      const result = dfsStar(startArr, [], 0, depth, isGoal, moves, h, null, budget);
      if (result) return result;
    }
    return null;
  }

  function dfsStar(arr, path, depth, maxDepth, isGoal, moves, h, lastAxis, budget) {
    if (depth + h(arr) > maxDepth) return null;
    for (const m of moves) {
      // 剪枝：避免连续转同一轴（转回去是冗余）
      if (lastAxis !== null && m.axis === lastAxis) continue;
      if (budget.left <= 0) return null;
      budget.left--;
      const next = applyPerm(arr, m.perm);
      if (isGoal(next)) return [...path, m.name];
      const r = dfsStar(next, [...path, m.name], depth + 1, maxDepth, isGoal, moves, h, m.axis, budget);
      if (r) return r;
    }
    return null;
  }

  // BFS 找满足目标检测的动作序列（父指针回溯，BigInt key + 队列索引优化）
  function encodeArr(arr) {
    let k = 0n;
    for (let i = 0; i < 24; i++) k = k * 6n + BigInt(arr[i]);
    return k;
  }

  function bfsPair(startArr, isGoal, moves, maxDepth, nodeBudget) {
    const startKey = encodeArr(startArr);
    const parent = new Map();
    parent.set(startKey, null);
    const queue = [{ arr: startArr, key: startKey, depth: 0 }];
    let goalKey = -1n;
    let head = 0;
    const budget = nodeBudget || Infinity;

    while (head < queue.length && goalKey < 0) {
      if (parent.size > budget) return null;
      const { arr, key, depth } = queue[head++];
      if (depth >= maxDepth) continue;
      for (const m of moves) {
        const next = applyPerm(arr, m.perm);
        const nk = encodeArr(next);
        if (parent.has(nk)) continue;
        parent.set(nk, { parentKey: key, move: m.name });
        if (isGoal(next)) { goalKey = nk; break; }
        queue.push({ arr: next, key: nk, depth: depth + 1 });
      }
    }
    if (goalKey < 0) return null;
    const path = [];
    let k = goalKey;
    while (parent.get(k)) {
      const p = parent.get(k);
      path.unshift(p.move);
      k = p.parentKey;
    }
    return path;
  }

  // BFS 移动目标色块到槽位（中层转动 + 保护已配对槽位）
  function moveBlock(centers, n, slot, color, moves, protectedSlots) {
    const startKey = positionKey(centers, n);
    const queue = [{ centers, path: [] }];
    const visited = new Set([startKey]);
    const maxDepth = 4;
    const eps = 1e-9;

    function stillProtected(c) {
      for (const p of protectedSlots) {
        const at = c.find(x => Math.abs(x.x - p.slot[0]) < eps && Math.abs(x.y - p.slot[1]) < eps && Math.abs(x.z - p.slot[2]) < eps);
        if (!at || at.color !== p.color) return false;
      }
      return true;
    }

    while (queue.length) {
      const { centers: cur, path } = queue.shift();
      if (path.length >= maxDepth) continue;
      for (const m of moves) {
        const next = rotateCenters(cur, m.axis, m.layer, m.dir, n);
        if (!stillProtected(next)) continue;
        const key = positionKey(next, n);
        if (visited.has(key)) continue;
        visited.add(key);
        const newPath = [...path, m.name];
        const atSlot = next.find(c => Math.abs(c.x - slot[0]) < eps && Math.abs(c.y - slot[1]) < eps && Math.abs(c.z - slot[2]) < eps);
        if (atSlot && atSlot.color === color) return newPath;
        queue.push({ centers: next, path: newPath });
      }
    }
    return [];
  }

  // 配对一对相对面：单向 BFS（中层转动 + 优化紧凑编码 + 父指针）
  function solvePairFaces(state, n, faceA, faceB, moves, protectedFaces) {
    const startCenters = extractCenters(state, n);
    const colorA = FACE_TO_COLOR[faceA];
    const colorB = FACE_TO_COLOR[faceB];

    if (faceSolved(startCenters, n, faceA, colorA) && faceSolved(startCenters, n, faceB, colorB)) return [];

    // 只用中层转动（外层不改变中心块面归属），全部 12 个（2U/2D 也参与面内调整）
    const midMoves = allMoves(n).filter(m => m.dir !== 2 && m.face.startsWith('2'));

    const startKey = positionKey(startCenters, n);
    const parent = new Map();
    parent.set(startKey, null);
    const queue = [{ centers: startCenters, key: startKey, depth: 0 }];
    const maxDepth = 6;
    let goalKey = null;

    while (queue.length && !goalKey) {
      const { centers: cur, key: curKey, depth } = queue.shift();
      if (depth >= maxDepth) continue;
      for (const m of midMoves) {
        const next = rotateCenters(cur, m.axis, m.layer, m.dir, n);
        const key = positionKey(next, n);
        if (parent.has(key)) continue;
        parent.set(key, { parentKey: curKey, move: m.name });
        if (faceSolved(next, n, faceA, colorA) && faceSolved(next, n, faceB, colorB)) { goalKey = key; break; }
        queue.push({ centers: next, key, depth: depth + 1 });
      }
    }

    if (!goalKey) return [];
    const path = [];
    let k = goalKey;
    while (parent.get(k)) {
      const p = parent.get(k);
      path.unshift(p.move);
      k = p.parentKey;
    }
    for (const mv of path) applyMove(state, mv, n);
    return path;
  }

  // 一对相对面的局部位置编码（只编码这两个面的 8 个中心块）
  function facePairPosKey(centers, n, faceA, faceB) {
    const outer = (n - 1) / 2;
    const eps = 1e-9;
    const axis = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };
    const val = { U: outer, D: -outer, R: outer, L: -outer, F: outer, B: -outer };
    const parts = [];
    for (const face of [faceA, faceB]) {
      const blocks = centers.filter(c => Math.abs(c[axis[face]] - val[face]) < eps);
      parts.push(blocks.map(c => `${c.x},${c.y},${c.z}:${c.color}`).sort().join('|'));
    }
    return parts.join('||');
  }

  // 构造"该对标准 + 其他面颜色守恒"的目标（用交换保证每种颜色仍各 4 个）
  function buildPartialTarget(centers, n, faceA, faceB) {
    const outer = (n - 1) / 2;
    const eps = 1e-9;
    const axis = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };
    const val = { U: outer, D: -outer, R: outer, L: -outer, F: outer, B: -outer };
    const isOnFace = (c, f) => Math.abs(c[axis[f]] - val[f]) < eps;
    const result = centers.map(c => ({ ...c }));

    for (const face of [faceA, faceB]) {
      const targetColor = FACE_TO_COLOR[face];
      // 该面的非 targetColor 槽位
      const slots = result.filter(c => isOnFace(c, face) && c.color !== targetColor);
      for (const slot of slots) {
        // 找其他面（非该对）的 targetColor 块
        const src = result.find(c => c.color === targetColor && !isOnFace(c, faceA) && !isOnFace(c, faceB));
        if (!src) break;
        const tmp = slot.color;
        slot.color = src.color;
        src.color = tmp;
      }
    }
    return result;
  }

  // 局部双向 BFS：用该对两个面的"颜色集合"编码（忽略面内排列，良定义）
  function solvePairLocal(centers, n, faceA, faceB, moves, protectedFaces) {
    const targetCenters = buildSolvedCenters(n);
    const keyFn = (c) => faceSetKey(c, n, faceA, faceB);

    const startKey = keyFn(centers);
    const targetKey = keyFn(targetCenters);
    if (startKey === targetKey) return [];

    const fwd = new Map();
    const bwd = new Map();
    fwd.set(startKey, []);
    bwd.set(targetKey, []);

    let fwdQueue = [{ centers, path: [] }];
    let bwdQueue = [{ centers: targetCenters, path: [] }];
    let solution = null;

    function stillProtected(c) {
      for (const pf of protectedFaces) {
        if (!faceSolved(c, n, pf, FACE_TO_COLOR[pf])) return false;
      }
      return true;
    }

    for (let depth = 0; depth < 5 && !solution; depth++) {
      const newFwd = [];
      for (const node of fwdQueue) {
        for (const m of moves) {
          const next = rotateCenters(node.centers, m.axis, m.layer, m.dir, n);
          if (!stillProtected(next)) continue;
          const key = keyFn(next);
          if (fwd.has(key)) continue;
          const path = [...node.path, m.name];
          if (bwd.has(key)) { solution = path.concat(inversePath(bwd.get(key))); break; }
          fwd.set(key, path);
          newFwd.push({ centers: next, path });
        }
        if (solution) break;
      }
      fwdQueue = newFwd;
      if (solution) break;

      const newBwd = [];
      for (const node of bwdQueue) {
        for (const m of moves) {
          const next = rotateCenters(node.centers, m.axis, m.layer, m.dir, n);
          const key = keyFn(next);
          if (bwd.has(key)) continue;
          const path = [...node.path, m.name];
          if (fwd.has(key)) { solution = fwd.get(key).concat(inversePath(path)); break; }
          bwd.set(key, path);
          newBwd.push({ centers: next, path });
        }
        if (solution) break;
      }
      bwdQueue = newBwd;
    }
    return solution;
  }

  // 一对相对面的"颜色集合"编码（忽略面内排列）
  function faceSetKey(centers, n, faceA, faceB) {
    const outer = (n - 1) / 2;
    const eps = 1e-9;
    const axis = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };
    const val = { U: outer, D: -outer, R: outer, L: -outer, F: outer, B: -outer };
    const result = [];
    for (const face of [faceA, faceB]) {
      const colors = centers.filter(c => Math.abs(c[axis[face]] - val[face]) < eps).map(c => c.color).sort();
      result.push(colors.join(''));
    }
    return result.join('|');
  }

  // 含位置的中心块编码（紧凑：坐标索引 + 颜色索引）
  const COLOR_INDEX = { white: 0, yellow: 1, red: 2, orange: 3, green: 4, blue: 5 };
  // 预计算中心块坐标的固定顺序（按 (x,y,z) 排序），positionKey 复用避免每次 sort
  const coordOrderCache = {};
  function getCoordOrder(n) {
    const key = String(n);
    if (coordOrderCache[key]) return coordOrderCache[key];
    const max = (n - 1) / 2, half = 0.5;
    const coords = [];
    for (const [outerAxis, ov] of [['x', max], ['x', -max], ['y', max], ['y', -max], ['z', max], ['z', -max]]) {
      const inner = ['x', 'y', 'z'].filter(a => a !== outerAxis);
      for (const i1 of [half, -half]) {
        for (const i2 of [half, -half]) {
          const c = { x: 0, y: 0, z: 0 };
          c[outerAxis] = ov;
          c[inner[0]] = i1;
          c[inner[1]] = i2;
          coords.push(`${c.x},${c.y},${c.z}`);
        }
      }
    }
    coordOrderCache[key] = coords;
    return coords;
  }

  function positionKey(centers, n) {
    // 用预计算的坐标顺序 + Map，避免 sort
    const map = {};
    for (const c of centers) {
      map[`${c.x},${c.y},${c.z}`] = COLOR_INDEX[c.color] || 0;
    }
    const order = getCoordOrder(n || 4);
    let key = '';
    for (const coord of order) {
      key += map[coord] !== undefined ? map[coord] : '0';
    }
    return key;
  }

  // BFS 配对单个面：目标 = 该面 4 块同色，且不破坏已配对的面
  function solveOneFace(centers, n, face, color, moves, protectedFaces) {
    const startKey = positionKey(centers, n);
    const queue = [{ centers, path: [] }];
    const visited = new Set([startKey]);
    const maxDepth = 4;

    function stillProtected(c) {
      for (const pf of protectedFaces) {
        if (!faceSolved(c, n, pf, FACE_TO_COLOR[pf])) return false;
      }
      return true;
    }

    while (queue.length) {
      const { centers: cur, path } = queue.shift();
      if (path.length >= maxDepth) continue;
      for (const m of moves) {
        const next = rotateCenters(cur, m.axis, m.layer, m.dir, n);
        if (!stillProtected(next)) continue; // 不破坏已配对的面
        const key = positionKey(next, n);
        if (visited.has(key)) continue;
        visited.add(key);
        const newPath = [...path, m.name];
        if (faceSolved(next, n, face, color)) return newPath;
        queue.push({ centers: next, path: newPath });
      }
    }
    return [];
  }

  // 检查某个面的 4 个中心块是否都是指定颜色
  function faceSolved(centers, n, face, color) {
    const outer = (n - 1) / 2;
    const eps = 1e-9;
    const axis = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' }[face];
    const val = { U: outer, D: -outer, R: outer, L: -outer, F: outer, B: -outer }[face];
    const faceCenters = centers.filter(c => Math.abs(c[axis] - val) < eps);
    if (faceCenters.length !== 4) return false;
    return faceCenters.every(c => c.color === color);
  }

  // BFS 配对单个面（目标：该面 4 中心同色）
  function solveOneCenter(state, n, face, color) {
    const centers = extractCenters(state, n);
    const moves = allMoves(n).filter(m => m.dir !== 2);
    const startKey = centerKey(centers, n);
    const queue = [{ centers, path: [] }];
    const visited = new Set([startKey]);
    const maxDepth = 3;

    while (queue.length) {
      const { centers: cur, path } = queue.shift();
      if (path.length >= maxDepth) continue;
      for (const m of moves) {
        const next = rotateCenters(cur, m.axis, m.layer, m.dir, n);
        const key = centerKey(next, n);
        if (visited.has(key)) continue;
        visited.add(key);
        const newPath = [...path, m.name];
        if (faceSolved(next, n, face, color)) return newPath;
        queue.push({ centers: next, path: newPath });
      }
    }
    return [];
  }

  // 构建标准配色的已解决中心块
  function buildSolvedCenters(n) {
    const outer = (n - 1) / 2;
    const half = 0.5;
    const centers = [];
    const faces = {
      U: { axis: 'y', val: outer, color: FACE_TO_COLOR.U },
      D: { axis: 'y', val: -outer, color: FACE_TO_COLOR.D },
      R: { axis: 'x', val: outer, color: FACE_TO_COLOR.R },
      L: { axis: 'x', val: -outer, color: FACE_TO_COLOR.L },
      F: { axis: 'z', val: outer, color: FACE_TO_COLOR.F },
      B: { axis: 'z', val: -outer, color: FACE_TO_COLOR.B },
    };
    for (const [face, info] of Object.entries(faces)) {
      const others = [-half, half];
      for (const a of others) {
        for (const b of others) {
          let x, y, z;
          if (info.axis === 'y') { y = info.val; x = a; z = b; }
          else if (info.axis === 'x') { x = info.val; y = a; z = b; }
          else { z = info.val; x = a; y = b; }
          centers.push({ x, y, z, color: info.color });
        }
      }
    }
    return centers;
  }

  // 逆序 + 逆动作
  function inversePath(path) {
    return path.slice().reverse().map(m => {
      if (m.endsWith("'")) return m.slice(0, -1);
      if (m.endsWith('2')) return m;
      return m + "'";
    });
  }

  // ==================== 棱块配对 ====================
  // 提取棱块：24 个，每个 { x, y, z, c1, c2 }（c1<=c2 排序）
  function extractEdgeBlocks(state, n) {
    const outer = (n - 1) / 2;
    const eps = 1e-9;
    const stickers = state.filter(s => {
      const coords = [Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)];
      return coords.filter(c => Math.abs(c - outer) < eps).length === 2;
    });
    const map = {};
    for (const s of stickers) {
      const key = `${s.x},${s.y},${s.z}`;
      (map[key] = map[key] || []).push(s.color);
    }
    const blocks = [];
    for (const key of Object.keys(map)) {
      const [x, y, z] = key.split(',').map(Number);
      const [a, b] = map[key].sort();
      blocks.push({ x, y, z, c1: a, c2: b });
    }
    return blocks;
  }

  // 边的标识（两个外层分量）：如 'UR', 'UF'
  function edgeKeyOf(block, n) {
    const outer = (n - 1) / 2;
    const eps = 1e-9;
    let key = '';
    if (Math.abs(block.x - outer) < eps) key += 'R';
    if (Math.abs(block.x + outer) < eps) key += 'L';
    if (Math.abs(block.y - outer) < eps) key += 'U';
    if (Math.abs(block.y + outer) < eps) key += 'D';
    if (Math.abs(block.z - outer) < eps) key += 'F';
    if (Math.abs(block.z + outer) < eps) key += 'B';
    return key;
  }

  function pairKey(block) { return block.c1 + block.c2; }

  // 检测所有 12 对棱是否配对
  function allEdgesPaired(blocks, n) {
    const byEdge = {};
    for (const b of blocks) {
      (byEdge[edgeKeyOf(b, n)] = byEdge[edgeKeyOf(b, n)] || []).push(b);
    }
    for (const k of Object.keys(byEdge)) {
      const arr = byEdge[k];
      if (arr.length !== 2) return false;
      if (pairKey(arr[0]) !== pairKey(arr[1])) return false;
    }
    return true;
  }

  // 棱块级转动（坐标旋转，颜色不变）
  function rotateEdgeBlocks(blocks, axis, layer, dir) {
    const eps = 1e-9;
    const result = blocks.map(b => ({ ...b }));
    for (const b of result) {
      let inLayer = false;
      if (axis === 'x' && Math.abs(b.x - layer) < eps) inLayer = true;
      else if (axis === 'y' && Math.abs(b.y - layer) < eps) inLayer = true;
      else if (axis === 'z' && Math.abs(b.z - layer) < eps) inLayer = true;
      if (!inLayer) continue;
      const times = dir === 2 ? 2 : 1;
      const d = dir === -1 ? -1 : 1;
      let [x, y, z] = [b.x, b.y, b.z];
      for (let t = 0; t < times; t++) [x, y, z] = rot90([x, y, z], axis, d);
      b.x = x; b.y = y; b.z = z;
    }
    return result;
  }

  function edgeBlocksKey(blocks) {
    return [...blocks].sort((a, b) => (a.x - b.x) || (a.y - b.y) || (a.z - b.z))
      .map(b => `${b.x},${b.y},${b.z}:${b.c1}${b.c2}`).join('|');
  }

  // 棱块配对的转动动作：宽转动（slice）为主，含外层用于移动
  function edgeMoves(n) {
    const max = (n - 1) / 2;
    const base = [
      { axis: 'y', layers: [max, max - 1], name: 'Uw' },
      { axis: 'y', layers: [-max, -(max - 1)], name: 'Dw' },
      { axis: 'x', layers: [max, max - 1], name: 'Rw' },
      { axis: 'x', layers: [-max, -(max - 1)], name: 'Lw' },
      { axis: 'z', layers: [max, max - 1], name: 'Fw' },
      { axis: 'z', layers: [-max, -(max - 1)], name: 'Bw' },
      // 外层（用于把伙伴移到配对位置）
      { axis: 'y', layers: [max], name: 'U' },
      { axis: 'y', layers: [-max], name: 'D' },
      { axis: 'x', layers: [max], name: 'R' },
      { axis: 'x', layers: [-max], name: 'L' },
      { axis: 'z', layers: [max], name: 'F' },
      { axis: 'z', layers: [-max], name: 'B' },
    ];
    const moves = [];
    for (const b of base) {
      moves.push({ ...b, dir: 1, name: b.name });
      moves.push({ ...b, dir: -1, name: b.name + "'" });
    }
    return moves;
  }

  // 对棱块应用一个动作（支持多层宽转动）
  function applyEdgeMove(blocks, move) {
    let result = blocks;
    for (const layer of move.layers) {
      result = rotateEdgeBlocks(result, move.axis, layer, move.dir);
    }
    return result;
  }

  // ==================== 棱块配对（整数数组 + 置换 + 双向 BFS） ====================
  const edgeSolverCache = {};
  function getEdgeSolver(n) {
    const key = String(n);
    if (edgeSolverCache[key]) return edgeSolverCache[key];
    const max = n - 1, half = 1;
    // 24 个棱块坐标（×2 整数，从 solved 状态提取）
    const solvedFaces = {};
    for (const f of FACE_ORDER) solvedFaces[f] = Array(n * n).fill(FACE_TO_COLOR[f]);
    const blocks = extractEdgeBlocks(buildState(n, solvedFaces), n);
    const coords = blocks.map(b => ({ x: Math.round(b.x * 2), y: Math.round(b.y * 2), z: Math.round(b.z * 2) }));
    const coordKey = c => c.x + ',' + c.y + ',' + c.z;
    const idxMap = {};
    coords.forEach((c, i) => idxMap[coordKey(c)] = i);
    function rotInt(c, axis, dir) {
      let x = c.x, y = c.y, z = c.z;
      if (axis === 'x') { if (dir === 1) { y = c.z; z = -c.y; } else { y = -c.z; z = c.y; } }
      else if (axis === 'y') { if (dir === 1) { x = -c.z; z = c.x; } else { x = c.z; z = -c.x; } }
      else { if (dir === 1) { x = c.y; y = -c.x; } else { x = -c.y; y = c.x; } }
      return { x, y, z };
    }
    // 每条边（两个外层分量符号）的 2 个棱块索引
    const edgeIdx = {};
    coords.forEach((c, i) => {
      const e = [];
      if (Math.abs(c.x) === max) e.push(c.x > 0 ? 'R' : 'L');
      if (Math.abs(c.y) === max) e.push(c.y > 0 ? 'U' : 'D');
      if (Math.abs(c.z) === max) e.push(c.z > 0 ? 'F' : 'B');
      const ek = e.sort().join('');
      (edgeIdx[ek] = edgeIdx[ek] || []).push(i);
    });
    // 宽转动置换（棱块配对只用宽转动，外层不改变配对状态）
    const moveDefs = {
      Uw: ['y', [max, half]], Dw: ['y', [-max, -half]],
      Rw: ['x', [max, half]], Lw: ['x', [-max, -half]],
      Fw: ['z', [max, half]], Bw: ['z', [-max, -half]],
    };
    const moves = [];
    for (const [name, [axis, layers]] of Object.entries(moveDefs)) {
      for (const [dir, suffix] of [[1, ''], [-1, "'"]]) {
        const perm = new Int8Array(24);
        for (let i = 0; i < 24; i++) {
          const c = coords[i];
          const inLayer = layers.some(l => c[axis] === l);
          perm[i] = inLayer ? idxMap[coordKey(rotInt(c, axis, -dir))] : i;
        }
        moves.push({ name: name + suffix, perm });
      }
    }
    edgeSolverCache[key] = { coords, idxMap, edgeIdx, moves };
    return edgeSolverCache[key];
  }

  // 联合求解器：中心 + 棱块的统一置换（动作 = 外层 + 宽转动）
  const jointSolverCache = {};
  function getJointSolver(n) {
    const key = String(n);
    if (jointSolverCache[key]) return jointSolverCache[key];
    const cs = getCenterSolver(n);
    const es = getEdgeSolver(n);
    const max = n - 1, half = 1;
    const ck = c => c.x + ',' + c.y + ',' + c.z;
    function rotInt(c, axis, dir) {
      let x = c.x, y = c.y, z = c.z;
      if (axis === 'x') { if (dir === 1) { y = c.z; z = -c.y; } else { y = -c.z; z = c.y; } }
      else if (axis === 'y') { if (dir === 1) { x = -c.z; z = c.x; } else { x = c.z; z = -c.x; } }
      else { if (dir === 1) { x = c.y; y = -c.x; } else { x = -c.y; y = c.x; } }
      return { x, y, z };
    }
    const moveDefs = {
      U: ['y', [max]], D: ['y', [-max]], R: ['x', [max]], L: ['x', [-max]], F: ['z', [max]], B: ['z', [-max]],
      Uw: ['y', [max, half]], Dw: ['y', [-max, -half]], Rw: ['x', [max, half]], Lw: ['x', [-max, -half]], Fw: ['z', [max, half]], Bw: ['z', [-max, -half]],
    };
    const moves = [];
    for (const [name, [axis, layers]] of Object.entries(moveDefs)) {
      for (const [dir, suffix] of [[1, ''], [-1, "'"]]) {
        const cPerm = new Int8Array(24);
        for (let i = 0; i < 24; i++) {
          const c = cs.coords[i];
          cPerm[i] = layers.some(l => c[axis] === l) ? cs.idxMap[ck(rotInt(c, axis, -dir))] : i;
        }
        const ePerm = new Int8Array(24);
        for (let i = 0; i < 24; i++) {
          const c = es.coords[i];
          ePerm[i] = layers.some(l => c[axis] === l) ? es.idxMap[ck(rotInt(c, axis, -dir))] : i;
        }
        moves.push({ name: name + suffix, cPerm, ePerm });
      }
    }
    jointSolverCache[key] = { moves, cs, es };
    return jointSolverCache[key];
  }

  // ==================== 棱块配对（降阶法：自由切片 + 末段翻转算法） ====================
  // 原理：中心解好后，棱块配对分两阶段：
  //   1) 自由切片：定位两翼 → 2U 配对 → 平衡存储到 U/D → 2U' 恢复中心，直到 U/D 存满（8 条）。
  //   2) 最后 4 条（赤道）：用"翻转算法"(R U R' F R' F' R) + Uw/Dw 的抽象模型做小规模 BFS。
  const edgeOuterCache = {};
  function getEdgeOuterMoves(n) {
    const key = String(n);
    if (edgeOuterCache[key]) return edgeOuterCache[key];
    const es = getEdgeSolver(n);
    const coords = es.coords, idxMap = es.idxMap;
    const max = n - 1, half = 1;
    const ck = c => c.x + ',' + c.y + ',' + c.z;
    function rotInt(c, axis, dir) {
      let x = c.x, y = c.y, z = c.z;
      if (axis === 'x') { if (dir === 1) { y = c.z; z = -c.y; } else { y = -c.z; z = c.y; } }
      else if (axis === 'y') { if (dir === 1) { x = -c.z; z = c.x; } else { x = c.z; z = -c.x; } }
      else { if (dir === 1) { x = c.y; y = -c.x; } else { x = -c.y; y = c.x; } }
      return { x, y, z };
    }
    const moves = [];
    // [name, axis, layer, balanceFace]：balanceFace 用于 store 阶段保证中心回正（F/B/R/L 各 mod4）
    for (const [name, axis, layer, bal] of [['U', 'y', max, null], ['D', 'y', -max, null], ['R', 'x', max, 'R'], ['L', 'x', -max, 'L'], ['F', 'z', max, 'F'], ['B', 'z', -max, 'B']]) {
      for (const [dir, sfx] of [[1, ''], [-1, "'"]]) {
        const perm = new Int8Array(24);
        for (let i = 0; i < 24; i++) { const c = coords[i]; perm[i] = (c[axis] === layer) ? idxMap[ck(rotInt(c, axis, -dir))] : i; }
        moves.push({ name: name + sfx, perm, bal, dir });
      }
    }
    edgeOuterCache[key] = { moves, coords, idxMap, max };
    return edgeOuterCache[key];
  }

  // 从贴纸状态提取 24 个棱块翼的颜色对值（min*6+max）
  function wingValuesOf(state, n) {
    const es = getEdgeSolver(n);
    const COLOR_MAP = { white: 0, yellow: 1, red: 2, orange: 3, green: 4, blue: 5 };
    const w = new Uint8Array(24);
    for (const b of extractEdgeBlocks(state, n)) {
      const idx = es.idxMap[Math.round(b.x * 2) + ',' + Math.round(b.y * 2) + ',' + Math.round(b.z * 2)];
      if (idx !== undefined) {
        const a = COLOR_MAP[b.c1] ?? 0, c = COLOR_MAP[b.c2] ?? 0;
        w[idx] = Math.min(a, c) * 6 + Math.max(a, c);
      }
    }
    return w;
  }

  function solveEdges(state, n, onProgress, variant) {
    const es = getEdgeSolver(n);
    const om = getEdgeOuterMoves(n);
    const idxMap = es.idxMap;
    const max = n - 1;
    const baseEdges = Object.values(es.edgeIdx);
    const v = (((variant || 0) % 4) + 4) % 4;
    const edgeList = v === 0 ? baseEdges
      : v === 1 ? [...baseEdges].reverse()
      : v === 2 ? [...baseEdges.slice(6), ...baseEdges.slice(0, 6)]
      : [...baseEdges.slice(3), ...baseEdges.slice(0, 3)];
    // 关键翼位置（×2 坐标）
    const FRU = idxMap[max + ',' + 1 + ',' + max];      // FR-upper
    const FLL = idxMap[(-max) + ',' + (-1) + ',' + max]; // FL-lower
    const inv = m => m.endsWith("'") ? m.slice(0, -1) : m + "'";

    const solution = [];
    let wings = wingValuesOf(state, n);
    const applySeq = (names) => { for (const nm of names) { applyMove(state, nm, n); solution.push(nm); } };

    const ep = (w, e) => w[e[0]] === w[e[1]];
    const onUD = (e) => { const c = es.coords[e[0]]; return Math.abs(c.y) === max; };
    const allPairedOnUD = (w) => { for (const e of edgeList) if (ep(w, e) && !onUD(e)) return false; return true; };
    const allUDPaired = (w) => { for (const e of edgeList) if (onUD(e) && !ep(w, e)) return false; return true; };
    const encW = (w) => { let k = 0n; for (let i = 0; i < 24; i++) k = k * 36n + BigInt(w[i]); return k; };
    const appW = (w, p) => { const r = new Uint8Array(24); for (let i = 0; i < 24; i++) r[i] = w[p[i]]; return r; };
    const updBal = (bal, m) => { if (!m.bal) return bal; const shift = { F: 0, B: 2, R: 4, L: 6 }[m.bal]; const cur = (bal >> shift) & 3; const nv = (cur + (m.dir === 1 ? 1 : 3)) & 3; return (bal & ~(3 << shift)) | (nv << shift); };

    // 外层 BFS（定位）：wings-only
    function outerBFS(w, goal, maxDepth) {
      const sk = encW(w); const parent = new Map(); parent.set(sk, null);
      const queue = [{ w, k: sk, d: 0, last: '' }]; let head = 0, gk = -1n;
      while (head < queue.length && gk < 0n) {
        const { w: cw, k, d, last } = queue[head++];
        if (d >= maxDepth) continue;
        for (const m of om.moves) {
          if (m.name === inv(last)) continue;
          const nw = appW(cw, m.perm); const nk = encW(nw);
          if (parent.has(nk)) continue;
          parent.set(nk, { pk: k, mv: m.name });
          if (goal(nw)) { gk = nk; break; }
          queue.push({ w: nw, k: nk, d: d + 1, last: m.name });
        }
      }
      if (gk < 0n) return null;
      const path = []; let k = gk;
      while (parent.get(k)) { const p = parent.get(k); path.unshift(p.mv); k = p.pk; }
      return path;
    }
    // 存储 BFS（带平衡）
    function storeBFS(w, bal0, goal, maxDepth) {
      const sk = encW(w) * 256n + BigInt(bal0);
      const parent = new Map(); parent.set(sk, null);
      const queue = [{ w, bal: bal0, k: sk, d: 0, last: '' }]; let head = 0, gk = -1n;
      while (head < queue.length && gk < 0n) {
        const { w: cw, bal: cb, k, d, last } = queue[head++];
        if (d >= maxDepth) continue;
        for (const m of om.moves) {
          if (m.name === inv(last)) continue;
          const nw = appW(cw, m.perm); const nb = updBal(cb, m);
          const nk = encW(nw) * 256n + BigInt(nb);
          if (parent.has(nk)) continue;
          parent.set(nk, { pk: k, mv: m.name });
          if (goal(nw, nb)) { gk = nk; break; }
          queue.push({ w: nw, bal: nb, k: nk, d: d + 1, last: m.name });
        }
      }
      if (gk < 0n) return null;
      const path = []; let k = gk;
      while (parent.get(k)) { const p = parent.get(k); path.unshift(p.mv); k = p.pk; }
      return path;
    }

    // 预处理：把已配对的赤道边移到 U/D（建立不变量：已配对边都在 U/D）
    for (let pre = 0; pre < 6 && !allPairedOnUD(wings); pre++) {
      const store = outerBFS(wings, (x) => allPairedOnUD(x), 6);
      if (!store) break;
      applySeq(store); wings = wingValuesOf(state, n);
    }

    // 阶段 1：自由切片配对到 8 条（某条边卡住时跳过它，继续尝试其它边）
    const skipped = [];
    for (let iter = 0; iter < 14; iter++) {
      if (edgeList.every(e => ep(wings, e))) break;
      if (onProgress) onProgress(Math.min(8, edgeList.filter(e => ep(wings, e)).length), 12);
      const bad = edgeList.find(e => !ep(wings, e) && !skipped.includes(e));
      if (!bad) break;
      const val = wings[bad[0]];
      const pos = outerBFS(wings, (x) => x[FRU] === val && x[FLL] === val && allPairedOnUD(x), 6);
      if (!pos) { skipped.push(bad); continue; }
      applySeq(pos); wings = wingValuesOf(state, n);
      applySeq(['2U']); wings = wingValuesOf(state, n);
      const store = storeBFS(wings, 0, (x, b) => allPairedOnUD(x) && b === 0, 6);
      if (!store) { applySeq(["2U'"]); wings = wingValuesOf(state, n); skipped.push(bad); continue; }
      applySeq(store); wings = wingValuesOf(state, n);
      applySeq(["2U'"]); wings = wingValuesOf(state, n);
    }

    // 阶段 2：最后 4 条（抽象模型：8 赤道翼 + 平衡）
    const eqFullIdx = [
      idxMap[max + ',' + 1 + ',' + max], idxMap[max + ',' + (-1) + ',' + max],     // FR 上/下
      idxMap[(-max) + ',' + 1 + ',' + max], idxMap[(-max) + ',' + (-1) + ',' + max], // FL 上/下
      idxMap[max + ',' + 1 + ',' + (-max)], idxMap[max + ',' + (-1) + ',' + (-max)], // BR 上/下
      idxMap[(-max) + ',' + 1 + ',' + (-max)], idxMap[(-max) + ',' + (-1) + ',' + (-max)], // BL 上/下
    ];
    const eq0 = eqFullIdx.map(i => wings[i]);
    const goalE = (e, b) => b === 0 && e[0] === e[1] && e[2] === e[3] && e[4] === e[5] && e[6] === e[7];
    if (!goalE(eq0, 0)) {
      const abstractMoves = [
        { name: 'FLIP', perm: [1, 0, 2, 3, 4, 5, 6, 7], bal: [0, 0] },
        { name: 'Uw', perm: [4, 1, 0, 3, 6, 5, 2, 7], bal: [1, 0] },
        { name: "Uw'", perm: [2, 1, 6, 3, 0, 5, 4, 7], bal: [-1, 0] },
        { name: 'Dw', perm: [0, 5, 2, 1, 4, 7, 6, 3], bal: [0, 1] },
        { name: "Dw'", perm: [0, 3, 2, 7, 4, 1, 6, 5], bal: [0, -1] },
      ];
      const encE = (e) => { let k = 0n; for (let i = 0; i < 8; i++) k = k * 36n + BigInt(e[i]); return k; };
      const appE = (e, p) => { const r = new Uint8Array(8); for (let i = 0; i < 8; i++) r[i] = e[p[i]]; return r; };
      const sk = encE(eq0);
      const parent = new Map(); parent.set(sk, null);
      const queue = [{ e: eq0, bal: [0, 0], k: sk, d: 0 }]; let head = 0, gk = -1n;
      while (head < queue.length && gk < 0n) {
        const { e: ce, bal, k, d } = queue[head++];
        if (d >= 16) continue;
        for (const m of abstractMoves) {
          const ne = appE(ce, m.perm);
          const nb = [(bal[0] + m.bal[0]) & 3, (bal[1] + m.bal[1]) & 3];
          const nk = encE(ne) * 16n + BigInt(nb[0] * 4 + nb[1]);
          if (parent.has(nk)) continue;
          parent.set(nk, { pk: k, mv: m.name });
          if (goalE(ne, nb[0] * 4 + nb[1])) { gk = nk; break; }
          queue.push({ e: ne, bal: nb, k: nk, d: d + 1 });
        }
      }
      if (gk >= 0n) {
        const path = []; let k = gk;
        while (parent.get(k)) { const p = parent.get(k); path.unshift(p.mv); k = p.pk; }
        for (const mv of path) {
          if (mv === 'FLIP') applySeq(['R', 'U', "R'", 'F', "R'", "F'", 'R']);
          else applySeq([mv]);
        }
      }
    }
    // 阶段 3（兜底）：抽象模型只覆盖"恰好 4 条赤道边未配对"。
    // 某些排列会在 U/D 层残留未配对边，此时用全 24 翼 + 中心的双向 BFS 通用收尾。
    if (!edgeList.every(e => ep(wingValuesOf(state, n), e))) {
      const tail = solveGeneralTail(state, n);
      for (const name of tail) { applyMove(state, name, n); solution.push(name); }
    }
    if (onProgress) onProgress(12, 12);
    return solution;
  }

  // 通用末段求解：联合状态（24 中心 + 24 翼）双向 BFS 到"所有边配对 + 中心标准"的具体目标。
  // 状态里显式带上中心，因此不需要任何"平衡"假设，结论严格可靠。
  function solveGeneralTail(state, n) {
    const js = getJointSolver(n);
    const CM = { white: 0, yellow: 1, red: 2, orange: 3, green: 4, blue: 5 };
    const STD = { U: 0, D: 1, F: 4, B: 5, R: 2, L: 3 };
    const CBASE = 6n ** 24n;
    const j0 = new Uint8Array(48);
    for (const c of extractCenters(state, n)) {
      const i = js.cs.idxMap[(c.x * 2) + ',' + (c.y * 2) + ',' + (c.z * 2)];
      if (i !== undefined) j0[i] = CM[c.color] ?? 0;
    }
    for (const b of extractEdgeBlocks(state, n)) {
      const i = js.es.idxMap[Math.round(b.x * 2) + ',' + Math.round(b.y * 2) + ',' + Math.round(b.z * 2)];
      if (i !== undefined) {
        const a = CM[b.c1] ?? 0, c = CM[b.c2] ?? 0;
        j0[24 + i] = Math.min(a, c) * 6 + Math.max(a, c);
      }
    }
    const enc = (j) => {
      let c = 0n, w = 0n;
      for (let i = 0; i < 24; i++) { c = c * 6n + BigInt(j[i]); w = w * 36n + BigInt(j[24 + i]); }
      return w * CBASE + c;
    };
    const app = (j, m) => {
      const r = new Uint8Array(48);
      for (let i = 0; i < 24; i++) { r[i] = j[m.cPerm[i]]; r[24 + i] = j[24 + m.ePerm[i]]; }
      return r;
    };
    const byName = Object.fromEntries(js.moves.map(m => [m.name, m]));
    // 把一串动作折成一个宏置换：依次应用 p1..pk 的组合为 p1[p2[..pk[i]..]]
    const compose = (names) => {
      const cP = new Int8Array(24), eP = new Int8Array(24);
      for (let i = 0; i < 24; i++) { cP[i] = i; eP[i] = i; }
      for (const nm of names) {
        const m = byName[nm];
        if (!m) return null;
        const nc = new Int8Array(24), ne = new Int8Array(24);
        for (let i = 0; i < 24; i++) { nc[i] = cP[m.cPerm[i]]; ne[i] = eP[m.ePerm[i]]; }
        cP.set(nc); eP.set(ne);
      }
      return { cPerm: cP, ePerm: eP };
    };
    const FLIP = ['R', 'U', "R'", 'F', "R'", "F'", 'R'];
    const FLIP_INV = ["R'", 'F', 'R', "F'", 'R', "U'", "R'"];
    const flipM = compose(FLIP), flipInvM = compose(FLIP_INV);
    const moves = js.moves.slice();
    if (flipM) moves.push({ name: 'FLIP', ...flipM });
    if (flipInvM) moves.push({ name: "FLIP'", ...flipInvM });
    // 纯中层动作 = 宽转 + 对应外层逆转（外层抵消、只剩内层），作为宏可显著缩短搜索深度
    const sliceMacros = [
      ['2U', ['Uw', "U'"]], ["2U'", ['U', "Uw'"]],
      ['2D', ['Dw', "D'"]], ["2D'", ['D', "Dw'"]],
      ['2R', ['Rw', "R'"]], ["2R'", ['R', "Rw'"]],
      ['2L', ['Lw', "L'"]], ["2L'", ['L', "Lw'"]],
      ['2F', ['Fw', "F'"]], ["2F'", ['F', "Fw'"]],
      ['2B', ['Bw', "B'"]], ["2B'", ['B', "Bw'"]],
    ];
    for (const [nm, seq] of sliceMacros) {
      const m = compose(seq);
      if (m) moves.push({ name: nm, ...m });
    }
    const invName = (nm) => {
      if (nm === 'FLIP') return "FLIP'";
      if (nm === "FLIP'") return 'FLIP';
      if (/^2[A-Z]/.test(nm)) return nm.endsWith("'") ? nm.slice(0, -1) : nm + "'";
      return nm.endsWith("'") ? nm.slice(0, -1) : nm + "'";
    };

    // 谓词目标：所有 12 条边配对 且 中心保持标准（目标是一个集合，不依赖具体目标可达性）
    const edges = Object.values(js.es.edgeIdx);
    const goal = (j) => {
      for (const e of edges) if (j[24 + e[0]] !== j[24 + e[1]]) return false;
      for (const f of Object.keys(STD)) for (const i of js.cs.faceIdx[f]) if (j[i] !== STD[f]) return false;
      return true;
    };
    if (goal(j0)) return [];
    const h = (j) => {
      let bad = 0;
      for (const e of edges) if (j[24 + e[0]] !== j[24 + e[1]]) bad++;
      return Math.ceil(bad / 2); // 一次转动最多让两条边配对
    };
    // IDA*：迭代加深 + 启发式剪枝 + 置换表去重，节点预算保证有界
    let seen = new Map();
    const dfs = (j, depth, maxDepth, last, budget) => {
      if (goal(j)) return [];
      if (depth + h(j) > maxDepth || budget.left <= 0) return null;
      const key = enc(j);
      const prev = seen.get(key);
      if (prev !== undefined && prev <= depth) return null;
      seen.set(key, depth);
      for (const m of moves) {
        if (m.name === invName(last)) continue;
        budget.left--;
        if (budget.left <= 0) return null;
        const r = dfs(app(j, m), depth + 1, maxDepth, m.name, budget);
        if (r) return [m.name, ...r];
      }
      return null;
    };
    let answer = null;
    for (let d = 1; d <= 12 && !answer; d++) {
      seen = new Map();
      answer = dfs(j0, 0, d, '', { left: 1200000 });
    }
    if (!answer) return [];
    const out = [];
    for (const nm of answer) {
      if (nm === 'FLIP') out.push(...FLIP);
      else if (nm === "FLIP'") out.push(...FLIP_INV);
      else out.push(nm);
    }
    return out;
  }

  // 降阶：把已解中心 + 已配对棱块的 N×N 状态降成 3×3 的颜色网格（每面 9 个颜色 key）
  function reduceTo3x3(state, n) {
    const faces = stateToFaces(state, n);
    const mid = Math.floor((n - 1) / 2);
    const map = [0, mid, n - 1, mid * n, mid * n + mid, mid * n + (n - 1), (n - 1) * n, (n - 1) * n + mid, (n - 1) * n + (n - 1)];
    const result = {};
    for (const face of FACE_ORDER) {
      result[face] = map.map(i => faces[face][i]);
    }
    return result;
  }

  // 4×4/5×5 完整降阶求解（中心 + 棱块），返回 { moves, reduced3x3 }
  // 3×3 阶段的求解与 parity 处理由调用方（app.js）用 vendor 库完成。
  function solveReduction(faces, n, onProgress) {
    let lastErr = null;
    // 整体重试：中心解不同会改变棱块排列；换一组策略常能绕开个别卡住的分支
    for (let attempt = 0; attempt < 8; attempt++) {
      const state = buildState(n, faces);
      const solution = [];
      try {
        if (onProgress) onProgress(0, 3, attempt ? `中心配对（重试 ${attempt}）` : '中心配对');
        const cMoves = solveCenters(state, n, attempt);
        solution.push(...cMoves);
        // 阶段校验：绝不把未完成的降阶状态交给 3×3 求解器
        if (!centersSolved(extractCenters(state, n), n)) throw new Error('中心配对校验失败');
        if (onProgress) onProgress(1, 3, '棱块配对');
        const eMoves = solveEdges(state, n, (a, b) => onProgress && onProgress(1, 3, '棱块配对 ' + a + '/' + b), attempt);
        solution.push(...eMoves);
        if (!allEdgesPaired(extractEdgeBlocks(state, n), n)) throw new Error('棱块配对校验失败');
        if (!centersSolved(extractCenters(state, n), n)) throw new Error('棱块配对后中心校验失败');
        const reduced3x3 = reduceTo3x3(state, n);
        // 降阶后的 3×3 必须每色恰好 9 个贴纸
        const counts = {};
        for (const f of FACE_ORDER) for (const c of reduced3x3[f]) counts[c] = (counts[c] || 0) + 1;
        if (Object.keys(counts).length !== 6 || Object.values(counts).some(v => v !== 9)) {
          throw new Error('降阶颜色计数校验失败');
        }
        if (onProgress) onProgress(2, 3, '降阶为3×3');
        return { moves: solution, reduced3x3, state };
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error('降阶求解未能在有限步内完成：' + (lastErr ? lastErr.message : '未知原因'));
  }

  return {
    FACE_ORDER,
    COLOR_TO_FACE,
    FACE_TO_COLOR,
    faceStickerPos,
    buildState,
    rotateLayer,
    applyMove,
    stateToFaces,
    extractCenters,
    extractEdges,
    solveCenters,
    centersSolved,
    allMoves,
    extractEdgeBlocks,
    allEdgesPaired,
    solveEdges,
    reduceTo3x3,
    solveReduction,
    rotateCenters,
    solveOneFace,
    faceSolved,
    solvePairFaces,
  };
})();

if (typeof window !== 'undefined') {
  window.BigCube = BigCube;
}

  function axisOfFace(face) {
    const m = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };
    return m[face.replace('2', '')];
  }
