/**
 * cube.js — 魔方数据模型
 * 管理魔方状态、转动操作、颜色方案
 * 面定义: U(上) R(右) F(前) D(下) L(左) B(后)
 */

// 颜色方案: 以中心块颜色为准
const COLORS = {
  U: 'white',   // 上 - 白
  R: 'red',     // 右 - 红
  F: 'green',   // 前 - 绿
  D: 'yellow',  // 下 - 黄
  L: 'orange',  // 左 - 橙
  B: 'blue',    // 后 - 蓝
};

// 颜色名 -> 键
const COLOR_TO_FACE = {
  white: 'U', yellow: 'D',
  red: 'R', orange: 'L',
  green: 'F', blue: 'B',
};

// CSS 颜色值（用于渲染）
const COLOR_CSS = {
  U: '#ffffff', R: '#d0342c', F: '#00a94f',
  D: '#ffd500', L: '#ff7b00', B: '#1a6dff',
};

// 面的中文名
const FACE_NAMES = { U: '上(白)', R: '右(红)', F: '前(绿)', D: '下(黄)', L: '左(橙)', B: '后(蓝)' };

// 转动操作定义
// 每个面: 顺时针转动时，哪些面受影响、如何重新映射
const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];

/**
 * 魔方类：用 54 个贴纸表示（6 面 × 9 格）
 * 每个贴纸存储其"属于哪个面"的颜色键
 */
class Cube {
  constructor() {
    this.reset();
  }

  // 重置为已还原状态
  reset() {
    this.state = {};
    for (const face of FACE_ORDER) {
      this.state[face] = Array(9).fill(face);
    }
  }

  // 克隆
  clone() {
    const c = new Cube();
    for (const face of FACE_ORDER) {
      c.state[face] = [...this.state[face]];
    }
    return c;
  }

  /**
   * 从用户输入的 6 面颜色重建魔方
   * @param {Object} input - { U: [9个颜色键], R: [...], ... }
   * 输入顺序为"面向该面时，从左上到右下逐行读取"
   */
  static fromFaces(input) {
    const c = new Cube();
    for (const face of FACE_ORDER) {
      if (!input[face] || input[face].length !== 9) {
        throw new Error(`面 ${face} 数据不完整`);
      }
      c.state[face] = input[face].map(v => v);
    }
    return c;
  }

  /**
   * 转动一个面
   * @param {string} move - 如 "U", "U'", "U2", "R", "R'", ...
   */
  applyMove(move) {
    const face = move[0];
    const type = move[1] || ''; // '' 顺时针, "'" 逆时针, "2" 180度
    let times = 1;
    if (type === "'") times = 3;
    else if (type === '2') times = 2;

    for (let i = 0; i < times; i++) {
      this._rotateFace(face);
    }
  }

  // 逆操作（用于撤销）
  applyMoveInverse(move) {
    const face = move[0];
    const type = move[1] || '';
    let times = 1;
    if (type === "'") times = 1;
    else if (type === '2') times = 2;
    else times = 3;
    for (let i = 0; i < times; i++) {
      this._rotateFace(face);
    }
  }

  // 顺时针转动一个面（内部实现）
  _rotateFace(face) {
    const s = this.state;
    // 1. 旋转该面自身的 9 个贴纸
    const old = [...s[face]];
    // 顺时针 90°: 新[i][j] = 旧[2-j][i]
    const rot = [
      old[6], old[3], old[0],
      old[7], old[4], old[1],
      old[8], old[5], old[2],
    ];
    s[face] = rot;

    // 2. 旋转相邻四个面的边缘贴纸
    // 定义每个面的相邻边关系（顺时针顺序）
    this._cycleEdges(face);
  }

  _cycleEdges(face) {
    const s = this.state;
    // 边的索引（面向该面时的边缘位置）
    // 每个受影响面有 3 个贴纸被替换
    let edges;
    switch (face) {
      case 'U':
        // U 顺时针：F顶行 -> R顶行 -> B顶行 -> L顶行
        edges = [
          { face: 'F', idx: [0, 1, 2] },
          { face: 'R', idx: [0, 1, 2] },
          { face: 'B', idx: [0, 1, 2] },
          { face: 'L', idx: [0, 1, 2] },
        ];
        break;
      case 'D':
        // D 顺时针：F底行 -> L底行 -> B底行 -> R底行
        edges = [
          { face: 'F', idx: [6, 7, 8] },
          { face: 'L', idx: [6, 7, 8] },
          { face: 'B', idx: [6, 7, 8] },
          { face: 'R', idx: [6, 7, 8] },
        ];
        break;
      case 'R':
        // R 顺时针：F右列 -> U右列 -> B左列 -> D右列
        edges = [
          { face: 'F', idx: [2, 5, 8] },
          { face: 'U', idx: [2, 5, 8] },
          { face: 'B', idx: [6, 3, 0] },
          { face: 'D', idx: [2, 5, 8] },
        ];
        break;
      case 'L':
        // L 顺时针：F左列 -> D左列 -> B右列 -> U左列
        edges = [
          { face: 'F', idx: [0, 3, 6] },
          { face: 'D', idx: [0, 3, 6] },
          { face: 'B', idx: [8, 5, 2] },
          { face: 'U', idx: [0, 3, 6] },
        ];
        break;
      case 'F':
        // F 顺时针：U底行 -> R左列 -> D顶行 -> L右列
        edges = [
          { face: 'U', idx: [6, 7, 8] },
          { face: 'R', idx: [0, 3, 6] },
          { face: 'D', idx: [2, 1, 0] },
          { face: 'L', idx: [8, 5, 2] },
        ];
        break;
      case 'B':
        // B 顺时针：U顶行 -> L左列 -> D底行 -> R右列
        edges = [
          { face: 'U', idx: [0, 1, 2] },
          { face: 'L', idx: [0, 3, 6] },
          { face: 'D', idx: [6, 7, 8] },
          { face: 'R', idx: [8, 5, 2] },
        ];
        break;
    }

    // 循环替换
    const first = edges[0];
    const firstVals = first.idx.map(i => s[first.face][i]);
    for (let e = 0; e < edges.length - 1; e++) {
      const from = edges[e + 1];
      const to = edges[e];
      for (let i = 0; i < 3; i++) {
        s[to.face][to.idx[i]] = s[from.face][from.idx[i]];
      }
    }
    const last = edges[edges.length - 1];
    for (let i = 0; i < 3; i++) {
      s[last.face][last.idx[i]] = firstVals[i];
    }
  }

  // 判断是否已还原
  isSolved() {
    for (const face of FACE_ORDER) {
      const center = face;
      for (const sticker of this.state[face]) {
        if (sticker !== center) return false;
      }
    }
    return true;
  }

  // 生成 Kociemba 格式的 54 字符字符串
  toKociembaString() {
    // Kociemba 顺序: U R F D L B，每个面 9 个贴纸
    let str = '';
    for (const face of FACE_ORDER) {
      for (const sticker of this.state[face]) {
        str += sticker;
      }
    }
    return str;
  }
}

// 导出（浏览器全局）
if (typeof window !== 'undefined') {
  window.Cube = Cube;
  window.COLORS = COLORS;
  window.COLOR_TO_FACE = COLOR_TO_FACE;
  window.COLOR_CSS = COLOR_CSS;
  window.FACE_NAMES = FACE_NAMES;
  window.FACE_ORDER = FACE_ORDER;
}
