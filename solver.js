/**
 * solver.js — 求解引擎封装
 * 使用 vendor/cube-solver.js（Kociemba 两阶段算法）
 * 负责：颜色网格 -> 面字母 -> 求解 -> 标准记法
 *
 * 注意：vendor/cube-solver.js 是 ES module，通过 <script type="module"> 加载
 * 这里通过全局暴露的接口与其协作
 */

const Solver = (() => {
  // 颜色键（来自识别） -> 面字母（U/R/F/L/D/B）
  // 配色方案：U白 R红 F绿 D黄 L橙 B蓝
  // 这里的映射在 app.js 中通过 center 动态确定，更稳健

  // 2×2 没有中心块，采用固定标准配色映射
  const COLOR_TO_LETTER_FIXED = { white: 'U', yellow: 'D', red: 'R', orange: 'L', green: 'F', blue: 'B' };

  /**
   * 从六面颜色网格构建求解输入
   * @param {Object} colorFaces - { U: [9个颜色key], R: [...], ... }
   *   每个颜色key是 'white'/'red'/'green'/'yellow'/'orange'/'blue'
   * @returns {Object} { U: [9个字母], R: [...], ... }
   */
  function colorFacesToLetters(colorFaces) {
    // 通过中心块颜色建立 颜色 -> 面字母 映射
    const colorToLetter = {};
    for (const face of FACE_ORDER) {
      const center = colorFaces[face][4]; // 中心块索引 4
      colorToLetter[center] = face;
    }

    const letters = {};
    for (const face of FACE_ORDER) {
      letters[face] = colorFaces[face].map(color => {
        const letter = colorToLetter[color];
        if (letter === undefined) {
          throw new Error(`无法识别的颜色: ${color}`);
        }
        return letter;
      });
    }
    return letters;
  }

  /**
   * 求解魔方
   * @param {Object} colorFaces - 六面颜色网格
   * @returns {Array<string>} 标准记法步骤，如 ["R", "U", "F'", ...]
   */
  function solve(colorFaces) {
    const letters = colorFacesToLetters(colorFaces);

    // 调用 vendor 库
    if (typeof cubeSolverModule === 'undefined') {
      throw new Error('求解库未加载');
    }

    const { cubeFromFaces, solve: cubeSolve, formatAlgorithm } = cubeSolverModule;

    const cube = cubeFromFaces(letters);
    const solution = cubeSolve(cube, { effort: 'full' });
    const algorithm = formatAlgorithm(solution);

    return algorithm.split(' ').filter(Boolean);
  }

  /**
   * 求解二阶魔方 2×2（复用 3×3 求解器的角块映射）
   * 2×2 本质是 3×3 的 8 个角块，把角块映射到 3×3、棱块/中心填标准色后求解。
   * @param {Object} colorFaces - { U: [4个颜色key], R: [...], ... } 每面 4 格
   * @returns {Array<string>} 标准记法步骤
   */
  function solve2x2(colorFaces) {
    if (typeof cubeSolverModule === 'undefined') {
      throw new Error('求解库未加载');
    }
    const { cubeFromFaces, solve: cubeSolve, formatAlgorithm } = cubeSolverModule;

    // 2×2 每面 4 格 → 3×3 每面的角块位置（index 0,2,6,8）
    const cornerIdx = [0, 2, 6, 8];
    const faces3x3 = {};
    for (const face of FACE_ORDER) {
      const arr = new Array(9).fill(face); // 棱块 + 中心 = 该面标准色（已解决）
      const stickers = colorFaces[face];
      cornerIdx.forEach((ci, i) => {
        const letter = COLOR_TO_LETTER_FIXED[stickers[i]];
        if (letter === undefined) throw new Error(`无法识别的颜色: ${stickers[i]}`);
        arr[ci] = letter;
      });
      faces3x3[face] = arr;
    }

    const cube = cubeFromFaces(faces3x3);
    const solution = cubeSolve(cube, { effort: 'full' });
    const algorithm = formatAlgorithm(solution);
    return algorithm.split(' ').filter(Boolean);
  }

  /**
   * 生成打乱序列
   */
  function generateScramble(length = 20) {
    const faces = ['U', 'R', 'F', 'D', 'L', 'B'];
    const types = ['', "'", '2'];
    const moves = [];
    let lastFace = '';
    for (let i = 0; i < length; i++) {
      let face;
      do {
        face = faces[Math.floor(Math.random() * 6)];
      } while (face === lastFace);
      lastFace = face;
      moves.push(face + types[Math.floor(Math.random() * 3)]);
    }
    return moves;
  }

  /**
   * 验证颜色网格是否合法（每种颜色恰好 9 个）
   */
  function validateFaces(colorFaces) {
    const counts = {};
    for (const face of FACE_ORDER) {
      const grid = colorFaces[face];
      if (!grid || grid.length !== 9) return { valid: false, msg: `面 ${face} 数据不完整` };
      for (const color of grid) {
        if (!color) return { valid: false, msg: `面 ${face} 存在未识别的格子` };
        counts[color] = (counts[color] || 0) + 1;
      }
    }
    for (const color of Object.keys(counts)) {
      if (counts[color] !== 9) {
        return { valid: false, msg: `颜色 ${color} 出现了 ${counts[color]} 次，应为 9 次` };
      }
    }
    if (Object.keys(counts).length !== 6) {
      return { valid: false, msg: `应有 6 种颜色，实际 ${Object.keys(counts).length} 种` };
    }
    return { valid: true };
  }

  /**
   * 验证 2×2 颜色网格（每种颜色恰好 4 次）
   */
  function validateFaces2x2(colorFaces) {
    const counts = {};
    for (const face of FACE_ORDER) {
      const grid = colorFaces[face];
      if (!grid || grid.length !== 4) return { valid: false, msg: `面 ${face} 数据不完整` };
      for (const color of grid) {
        if (!color) return { valid: false, msg: `面 ${face} 存在未识别的格子` };
        counts[color] = (counts[color] || 0) + 1;
      }
    }
    for (const color of Object.keys(counts)) {
      if (counts[color] !== 4) {
        return { valid: false, msg: `颜色 ${color} 出现了 ${counts[color]} 次，应为 4 次` };
      }
    }
    if (Object.keys(counts).length !== 6) {
      return { valid: false, msg: `应有 6 种颜色，实际 ${Object.keys(counts).length} 种` };
    }
    return { valid: true };
  }

  // 4×4/5×5 降阶法求解：中心 + 棱块 + 降阶为 3×3 + parity + 3×3 求解
  function solve4x4(colorFaces, onProgress) {
    if (typeof window.BigCube === 'undefined') throw new Error('四阶求解模块未加载');
    if (typeof cubeSolverModule === 'undefined') throw new Error('求解库未加载');

    const n = 4;
    const reduction = BigCube.solveReduction(colorFaces, n, onProgress);
    const moves = reduction.moves;
    const state = reduction.state;
    let reduced3x3 = reduction.reduced3x3;

    const colorToLetter = { white: 'U', yellow: 'D', red: 'R', orange: 'L', green: 'F', blue: 'B' };
    const { cubeFromFaces, solve: cubeSolve, formatAlgorithm, EdgeFlipError, ParityError } = cubeSolverModule;

    const OLL_PARITY = "Rw' U2 Rw U2 Rw U2 Rw2 F2 Rw' U2 Rw' U2 F2 Rw2 F2".split(' ');
    const PLL_PARITY = "2R2 U2 2R2 Uw2 2R2 Uw2".split(' ');
    const toLetters = (r3) => {
      const l = {};
      for (const f of FACE_ORDER) l[f] = r3[f].map(c => colorToLetter[c]);
      return l;
    };
    // vendor 的 3×3 记法 → BigCube 记法（D/L/B 方向相反）
    const v2b = (m) => {
      const f = m[0];
      if (f === 'D' || f === 'L' || f === 'B') {
        if (m.endsWith("'")) return m.slice(0, -1);
        if (m.endsWith('2')) return m;
        return m + "'";
      }
      return m;
    };

    let parityMoves = [];
    let cube = null;
    // parity 检测 + 修复（把 parity 算法应用到 4×4 状态后重新降阶）
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        cube = cubeFromFaces(toLetters(reduced3x3));
        break;
      } catch (e) {
        if (e instanceof EdgeFlipError) {
          parityMoves = parityMoves.concat(OLL_PARITY);
          for (const m of OLL_PARITY) BigCube.applyMove(state, m, n);
        } else if (e instanceof ParityError) {
          parityMoves = parityMoves.concat(PLL_PARITY);
          for (const m of PLL_PARITY) BigCube.applyMove(state, m, n);
        } else {
          throw e;
        }
        reduced3x3 = BigCube.reduceTo3x3(state, n);
      }
    }

    // 3×3 阶段求解
    const sol3 = cubeSolve(cube, { effort: 'full' });
    const alg3 = formatAlgorithm(sol3).split(' ').filter(Boolean).map(v2b);

    return [...moves, ...parityMoves, ...alg3];
  }

  return { solve, solve2x2, solve4x4, generateScramble, validateFaces, validateFaces2x2, colorFacesToLetters };
})();

if (typeof window !== 'undefined') {
  window.Solver = Solver;
}
