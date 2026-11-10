/**
 * app.js — 主应用逻辑
 * 整合计时器、识别、求解、3D 渲染
 *
 * 核心设计：vendor/cube-solver.js 是魔方状态的唯一真相源（Source of Truth）
 * 3D 渲染只负责"显示" facesFromCube 的结果，逻辑转动全部走 applyMoves
 */

(() => {
  'use strict';

  const cs = () => window.cubeSolverModule;

  // ===================== 应用状态 =====================
  const appState = {
    currentTab: 'timer',
    cubeType: '333',      // 当前魔方类型：'333' | '222'（后续扩展 444/555/pyram...）
    // 扫描状态
    scanFaces: {},        // { U: [9 colors], R: [...], ... }
    scanCells: {},        // { U: [9 cells 含 hsv/rgb], ... } 用于全局平衡纠错
    scanAutoFaces: {},    // { U: [9 colors], ... } 自动识别结果（不含用户手改）
    scanOrder: ['U', 'R', 'F', 'D', 'L', 'B'],
    scanIndex: 0,
    selectedCell: null,
    // 求解 + 3D
    solution: [],         // 标准记法 ['R', "U'", 'F2', ...]
    currentStep: -1,
    cubeState: null,      // vendor Cube 对象（3×3/2×2）
    bigCubeState: null,   // BigCube 贴纸状态（4×4/5×5）
    scrambleMoves: null,  // 应用内随机打乱序列（可直接求逆还原）
    scrambleFaces: null,  // 打乱时的面颜色快照（用于判断状态是否被手工改动）
    solveSource: '',      // 'inverse' | 'solver'，如实标注本次解法来源
    autoPlayTimer: null,
    timerRunning: false,
    // DIY 填色
    diyFaces: {},         // { U: [9 colorKey], ... } 用户在 3D 上涂的颜色
    selectedColor: null,  // 当前选中的颜色 key
    solveSpeed: 1000,     // 自动还原速度（ms/步）
    overlayTimer: null,   // 识别覆盖层淡出定时器
    toastTimer: null,     // 提示淡出定时器
  };

  const $ = (sel) => document.querySelector(sel);

  // 颜色 key（与 scanner.js 的 COLOR_KEYS 一致）
  const COLOR_KEYS = ['white', 'yellow', 'red', 'orange', 'green', 'blue'];
  // 颜色 key -> 面字母（标准配色）
  const COLOR_KEY_TO_LETTER = { white: 'U', yellow: 'D', red: 'R', orange: 'L', green: 'F', blue: 'B' };
  // 颜色 key -> CSS 色值
  const COLOR_KEY_CSS = { white: '#ffffff', yellow: '#ffd500', red: '#d0342c', orange: '#ff7b00', green: '#00a94f', blue: '#1a6dff' };
  // 颜色 key -> 中文名
  const COLOR_KEY_NAME = { white: '白', yellow: '黄', red: '红', orange: '橙', green: '绿', blue: '蓝' };

  // ===================== 魔方类型注册表 =====================
  // 每种魔方定义：面数、每面网格大小、面顺序、求解器、打乱器等
  const CUBE_TYPES = {
    '333': {
      id: '333', name: '三阶魔方', short: '3×3',
      size: 3,
      faceOrder: ['U', 'R', 'F', 'D', 'L', 'B'],
      faceName: { U: '上(白)', R: '右(红)', F: '前(绿)', D: '下(黄)', L: '左(橙)', B: '后(蓝)' },
    },
    '222': {
      id: '222', name: '二阶魔方', short: '2×2',
      size: 2,
      faceOrder: ['U', 'R', 'F', 'D', 'L', 'B'],
      faceName: { U: '上(白)', R: '右(红)', F: '前(绿)', D: '下(黄)', L: '左(橙)', B: '后(蓝)' },
    },
    '444': {
      id: '444', name: '四阶魔方', short: '4×4',
      size: 4,
      faceOrder: ['U', 'R', 'F', 'D', 'L', 'B'],
      faceName: { U: '上(白)', R: '右(红)', F: '前(绿)', D: '下(黄)', L: '左(橙)', B: '后(蓝)' },
    },
    '555': {
      id: '555', name: '五阶魔方', short: '5×5',
      size: 5,
      faceOrder: ['U', 'R', 'F', 'D', 'L', 'B'],
      faceName: { U: '上(白)', R: '右(红)', F: '前(绿)', D: '下(黄)', L: '左(橙)', B: '后(蓝)' },
    },
  };

  // 2×2 面贴纸 index -> 3D 角块坐标（统一坐标系统，每面 4 个角）
  const FACE_STICKER_POS_2x2 = {
    U: [[-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5]], // ULB, UBR, UFL, URF
    D: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5]], // DLF, DFR, DBL, DRB
    R: [[0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5]], // URF, UBR, DFR, DRB
    L: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5]], // ULB, UFL, DBL, DLF
    F: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5]], // UFL, URF, DLF, DFR
    B: [[0.5, 0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5]], // UBR, ULB, DRB, DBL
  };

  // 当前魔方类型对应的贴纸坐标映射
  function stickerPosFor(cubeTypeId) {
    if (cubeTypeId === '222') return FACE_STICKER_POS_2x2;
    if (cubeTypeId === '444') return FACE_STICKER_POS_4x4;
    if (cubeTypeId === '555') return FACE_STICKER_POS_5x5;
    return FACE_STICKER_POS;
  }

  // 通用生成 N×N 面贴纸坐标（"直视该面，左上到右下"）
  function generateFaceStickerPos(n) {
    const max = (n - 1) / 2;
    const asc = [];  // -max → +max
    for (let i = 0; i < n; i++) asc.push(-max + i);
    const desc = [...asc].reverse();  // +max → -max

    const rules = {
      U: (r, c) => [asc[c], max, asc[r]],
      D: (r, c) => [asc[c], -max, desc[r]],
      R: (r, c) => [max, desc[r], desc[c]],
      L: (r, c) => [-max, desc[r], asc[c]],
      F: (r, c) => [asc[c], desc[r], max],
      B: (r, c) => [desc[c], desc[r], -max],
    };
    const pos = {};
    for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
      pos[face] = [];
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          pos[face].push(rules[face](r, c));
        }
      }
    }
    return pos;
  }

  // 4×4 / 5×5 面贴纸坐标映射（每面 N×N 格）
  const FACE_STICKER_POS_4x4 = generateFaceStickerPos(4);
  const FACE_STICKER_POS_5x5 = generateFaceStickerPos(5);

  // 当前魔方的阶数 N
  function getSize() {
    const map = { '222': 2, '333': 3, '444': 4, '555': 5 };
    return map[appState.cubeType] || 3;
  }

  // 当前魔方每面格子数 / 网格边长
  function getStickerCount() { const n = getSize(); return n * n; }
  function getGridSize() { return getSize(); }

  // 当前魔方 cubie 大小：按阶数缩放，让所有 N×N 整体视觉尺寸一致
  function getCubieSize() {
    const n = getSize();
    const scale = 3 / n;
    const size = CUBIE_SIZE * scale;
    return { size, step: size + CUBIE_GAP * scale };
  }

  // 相邻 cubie 中心距（坐标 1 单位对应的物理距离）
  function getCubieStep() { return getCubieSize().step; }

  // 当前魔方沿每轴的 cubie 坐标数组（统一：-(N-1)/2 到 (N-1)/2）
  function getCoords() {
    const n = getSize();
    const coords = [];
    const start = -(n - 1) / 2;
    for (let i = 0; i < n; i++) coords.push(start + i);
    return coords;
  }

  // ===================== 面贴纸 index -> 3D cubie 坐标映射 =====================
  // 基于 vendor 库 CORNER_STICKERS / EDGE_STICKERS 精确推导
  // 3D 坐标：x向右, y向上, z向前(F方向)
  // 每个面 9 个贴纸，index 0-8 按"直视该面，左上到右下"排列
  const FACE_STICKER_POS = {
    // U 面 (y=+1)，俯视时 B 在顶部(z=-1), F 在底部(z=+1), L 在左(x=-1), R 在右(x=+1)
    U: [
      [-1, 1, -1], [0, 1, -1], [1, 1, -1],   // 顶行: ULB, UB, UBR
      [-1, 1, 0],  [0, 1, 0],  [1, 1, 0],     // 中行: UL, U, UR
      [-1, 1, 1],  [0, 1, 1],  [1, 1, 1],     // 底行: UFL, UF, URF
    ],
    // D 面 (y=-1)，从下方仰视时 F 在顶部(z=+1)
    D: [
      [-1, -1, 1], [0, -1, 1], [1, -1, 1],    // 顶行: DLF, DF, DFR
      [-1, -1, 0], [0, -1, 0], [1, -1, 0],    // 中行: DL, D, DR
      [-1, -1, -1], [0, -1, -1], [1, -1, -1], // 底行: DBL, DB, DRB
    ],
    // R 面 (x=+1)，从右侧看时 U 在顶部(y=+1), F 在前(z=+1), B 在后(z=-1)
    R: [
      [1, 1, 1],  [1, 1, 0],  [1, 1, -1],     // 顶行: URF, UR, UBR
      [1, 0, 1],  [1, 0, 0],  [1, 0, -1],     // 中行: FR, R, BR
      [1, -1, 1], [1, -1, 0], [1, -1, -1],    // 底行: DFR, DR, DRB
    ],
    // L 面 (x=-1)，从左侧看时 U 在顶部
    L: [
      [-1, 1, -1], [-1, 1, 0], [-1, 1, 1],    // 顶行: ULB, UL, UFL
      [-1, 0, -1], [-1, 0, 0], [-1, 0, 1],    // 中行: BL, L, FL
      [-1, -1, -1], [-1, -1, 0], [-1, -1, 1], // 底行: DBL, DL, DLF
    ],
    // F 面 (z=+1)，从前方看时 U 在顶部
    F: [
      [-1, 1, 1],  [0, 1, 1],  [1, 1, 1],     // 顶行: UFL, UF, URF
      [-1, 0, 1],  [0, 0, 1],  [1, 0, 1],     // 中行: FL, F, FR
      [-1, -1, 1], [0, -1, 1], [1, -1, 1],    // 底行: DLF, DF, DFR
    ],
    // B 面 (z=-1)，从后方看时 U 在顶部
    B: [
      [1, 1, -1],  [0, 1, -1],  [-1, 1, -1],  // 顶行: UBR, UB, ULB
      [1, 0, -1],  [0, 0, -1],  [-1, 0, -1],  // 中行: BR, B, BL
      [1, -1, -1], [0, -1, -1], [-1, -1, -1], // 底行: DRB, DB, DBL
    ],
  };

  // 标准记法转换：vendor 用 'R_PRIME'，我们显示用 "R'"
  function toVendorMove(move) {
    if (move.endsWith("'")) return move.slice(0, -1) + '_PRIME';
    return move; // 'R', 'R2'
  }
  function fromVendorMove(move) {
    if (move.endsWith('_PRIME')) return move.slice(0, -'_PRIME'.length) + "'";
    return move;
  }

  // 反向映射：给定 3D cubie 坐标 (x,y,z) 和面 face，返回该贴纸在该面的 index（0-8）
  // 反向索引缓存
  const _stickerIndexCache = {};
  function stickerIndexOf(face, x, y, z) {
    const key = `${face}:${x},${y},${z}`;
    if (_stickerIndexCache[key] !== undefined) return _stickerIndexCache[key];
    const positions = stickerPosFor(appState.cubeType)[face];
    for (let i = 0; i < positions.length; i++) {
      const [px, py, pz] = positions[i];
      if (px === x && py === y && pz === z) {
        _stickerIndexCache[key] = i;
        return i;
      }
    }
    _stickerIndexCache[key] = -1;
    return -1;
  }

  // 记法 -> 中文说明
  const MOVE_FACE_NAME = { U: '顶面', D: '底面', R: '右面', L: '左面', F: '前面', B: '后面' };
  function moveToDescription(move) {
    const face = move.replace(/^2/, '').replace(/w/ig, '').replace(/'/g, '').replace(/2$/, '')[0];
    const faceName = MOVE_FACE_NAME[face] || face;
    const isWide = /w/i.test(move);
    const isSlice = /^2/.test(move);
    const layer = isWide ? '两层' : (isSlice ? '中层' : '');
    if (move.endsWith('2')) {
      return `转动${faceName}${layer} 180°`;
    }
    if (move.endsWith("'")) {
      return `转动${faceName}${layer} 逆时针 90°`;
    }
    return `转动${faceName}${layer} 顺时针 90°`;
  }

  // ===================== 3D 渲染 =====================
  const CUBIE_SIZE = 0.93;
  const CUBIE_GAP = 0.04;
  const CUBIE_STEP = CUBIE_SIZE + CUBIE_GAP; // 相邻 cubie 中心距
  const CUBIE_ROUND = 0.10;   // 方块圆角半径
  const STICKER_SCALE = 0.78; // 贴纸占面宽比例（露出黑色边框）
  const STICKER_ROUND = 0.14; // 贴纸圆角半径

  // 生成圆角矩形 Shape（用于贴纸）
  function roundedRectShape(w, h, r) {
    const shape = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  }

  // 六个外表面的贴纸定义：法线、位置偏移、旋转
  const STICKER_FACES = [
    { face: 'R', n: [1, 0, 0],  rot: [0, Math.PI / 2, 0] },
    { face: 'L', n: [-1, 0, 0], rot: [0, -Math.PI / 2, 0] },
    { face: 'U', n: [0, 1, 0],  rot: [-Math.PI / 2, 0, 0] },
    { face: 'D', n: [0, -1, 0], rot: [Math.PI / 2, 0, 0] },
    { face: 'F', n: [0, 0, 1],  rot: [0, 0, 0] },
    { face: 'B', n: [0, 0, -1], rot: [0, Math.PI, 0] },
  ];

  const ThreeRenderer = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    cubies: [],          // 27 个小方块（含中心隐藏块，简化为 26 可见）
    container: null,
    cubieMap: new Map(), // "x,y,z" -> cubie 对象
    onStickerClick: null, // 点击贴纸回调 (pick) => void

    init(container) {
      if (this.scene) return;
      this.container = container;
      const width = container.clientWidth || 400;
      const height = container.clientHeight || 400;

      this.scene = new THREE.Scene();
      this.applyThemeBackground();

      // 监听系统主题变化，动态调整 3D 背景
      if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => this.applyThemeBackground();
        if (mq.addEventListener) mq.addEventListener('change', handler);
        else if (mq.addListener) mq.addListener(handler);
      }

      this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
      this.camera.position.set(4.8, 3.8, 4.8);
      this.camera.lookAt(0, 0, 0);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      container.appendChild(this.renderer.domElement);

      // 更柔和立体的光照：半球光 + 主光 + 补光 + 边缘轮廓光
      const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3f4a, 0.55);
      this.scene.add(hemi);

      const ambient = new THREE.AmbientLight(0xffffff, 0.35);
      this.scene.add(ambient);

      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(6, 10, 6);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      this.scene.add(key);

      const fill = new THREE.DirectionalLight(0xbfd4ff, 0.4);
      fill.position.set(-5, 1, -4);
      this.scene.add(fill);

      const rim = new THREE.DirectionalLight(0xffffff, 0.5);
      rim.position.set(0, -4, 5);
      this.scene.add(rim);

      if (window.OrbitControls) {
        this.controls = new window.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.12;
        this.controls.minDistance = 5.5;
        this.controls.maxDistance = 12;
        this.controls.target.set(0, 0, 0);
      }

      // 绑定贴纸点击检测（区分点击与拖动：只有位移小于阈值才算点击涂色）
      let downPos = null;
      this.renderer.domElement.addEventListener('pointerdown', (e) => {
        downPos = { x: e.clientX, y: e.clientY };
      });
      this.renderer.domElement.addEventListener('pointerup', (e) => {
        if (!this.onStickerClick || !downPos) return;
        const dx = e.clientX - downPos.x;
        const dy = e.clientY - downPos.y;
        downPos = null;
        // 位移超过阈值视为拖动（旋转），不涂色
        if (Math.sqrt(dx * dx + dy * dy) > 6) return;
        const pick = this.pickSticker(e.clientX, e.clientY);
        if (pick) this.onStickerClick(pick);
      });

      this.buildCubies();
      this.animate();
    },

    buildCubies() {
      this.cubies = [];
      this.cubieMap.clear();
      const { size } = getCubieSize();
      const RoundedBox = window.RoundedBoxGeometry || THREE.BoxGeometry;
      const stickerSize = size * STICKER_SCALE;
      // 贴纸几何体复用（按当前块大小缓存），避免 rebuild 反复创建/泄漏
      const stickerGeoKey = size.toFixed(2);
      if (!this._stickerGeo || this._stickerGeoKey !== stickerGeoKey) {
        this._stickerGeo = new THREE.ShapeGeometry(roundedRectShape(stickerSize, stickerSize, STICKER_ROUND), 12);
        this._stickerGeoKey = stickerGeoKey;
      }
      const stickerGeo = this._stickerGeo;
      const offset = size / 2 + 0.004; // 贴纸略凸出，避免 z-fighting

      // 根据魔方阶数决定 cubie 坐标：统一 -(N-1)/2 到 (N-1)/2
      const coordRange = getCoords();

      for (const x of coordRange) {
        for (const y of coordRange) {
          for (const z of coordRange) {
            // 跳过中心块（不可见）；偶数阶坐标不含 0，天然无中心
            if (x === 0 && y === 0 && z === 0) continue;

            const group = new THREE.Group();

            // 圆角黑色主体
            const bodyGeo = new RoundedBox(size, size, size, 4, CUBIE_ROUND);
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.42, metalness: 0.25 });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.castShadow = true;
            body.receiveShadow = true;
            group.add(body);

            // 外表面贴圆角贴纸
            const stickers = {};
            for (const sf of STICKER_FACES) {
              const maxCoord = (getSize() - 1) / 2;
              const isOuter = (
                (sf.n[0] === 1 && x === maxCoord) || (sf.n[0] === -1 && x === -maxCoord) ||
                (sf.n[1] === 1 && y === maxCoord) || (sf.n[1] === -1 && y === -maxCoord) ||
                (sf.n[2] === 1 && z === maxCoord) || (sf.n[2] === -1 && z === -maxCoord)
              );
              if (!isOuter) continue;

              const stickerMat = new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.24, metalness: 0.05 });
              const sticker = new THREE.Mesh(stickerGeo, stickerMat);
              sticker.position.set(sf.n[0] * offset, sf.n[1] * offset, sf.n[2] * offset);
              sticker.rotation.set(sf.rot[0], sf.rot[1], sf.rot[2]);
              sticker.userData = { face: sf.face, cubie: `${x},${y},${z}` };
              group.add(sticker);
              stickers[sf.face] = sticker;
            }

            group.position.set(x * getCubieStep(), y * getCubieStep(), z * getCubieStep());

            this.scene.add(group);
            const cubie = { group, x, y, z, body, stickers };
            this.cubies.push(cubie);
            this.cubieMap.set(`${x},${y},${z}`, cubie);
          }
        }
      }
    },

    // 根据 facesFromCube 的结果给每个 cubie 的贴纸着色
    applyFaces(faces) {
      // faces: { U: [面字母...], R: [...], ... }（3×3 每面 9 个，2×2 每面 4 个）
      const positions = stickerPosFor(appState.cubeType);
      for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
        const stickers = faces[face];
        const posList = positions[face];
        for (let i = 0; i < posList.length; i++) {
          const [x, y, z] = posList[i];
          const cubie = this.cubieMap.get(`${x},${y},${z}`);
          if (!cubie) continue;
          const letter = stickers[i];
          const colorHex = COLOR_CSS[letter];
          const stickerMesh = cubie.stickers[face];
          if (stickerMesh) {
            stickerMesh.material.color.set(colorHex);
          }
        }
      }
    },

    // 按逻辑状态「原地」同步贴纸颜色：不销毁、不重建任何 mesh，因此播放时不会跳色/闪烁。
    // mode: 'key'（颜色 key，4×4/5×5）| 'letter'（面字母，3×3/2×2）
    // 正常情况下贴纸已随方块转动到位，纠正数应为 0；若非 0 说明动画方向与逻辑不一致，
    // 这里会把颜色校准到逻辑状态，保证「每一步显示的颜色都对应这一步的转动」。
    syncFaces(faces, mode) {
      const positions = stickerPosFor(appState.cubeType);
      const letterToKey = { U: 'white', D: 'yellow', R: 'red', L: 'orange', F: 'green', B: 'blue' };
      let corrected = 0, matched = 0, missing = 0;
      for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
        const stickers = faces[face];
        if (!stickers) continue;
        const posList = positions[face];
        for (let i = 0; i < posList.length; i++) {
          const [x, y, z] = posList[i];
          const cubie = this.cubieMap.get(`${x},${y},${z}`);
          if (!cubie) { missing++; continue; }
          const mesh = cubie.stickers[face];
          if (!mesh) { missing++; continue; }
          const val = stickers[i];
          const hex = mode === 'key'
            ? (COLOR_KEY_CSS[val] || COLOR_KEY_CSS[letterToKey[val]])
            : (COLOR_CSS[val] || COLOR_KEY_CSS[letterToKey[val]]);
          if (!hex) continue;
          const target = hex.slice(1).toLowerCase();
          if (mesh.material.color.getHexString().toLowerCase() !== target) {
            mesh.material.color.set(hex);
            corrected++;
          } else {
            matched++;
          }
        }
      }
      this._lastSync = { corrected, matched, missing };
      return corrected;
    },

    // 销毁所有 cubie（释放资源）
    clearCubies() {
      for (const c of this.cubies) {
        this.scene.remove(c.group);
        if (c.body) {
          c.body.geometry.dispose();
          c.body.material.dispose();
        }
        for (const face in c.stickers) {
          c.stickers[face].material.dispose();
        }
      }
      this.cubies = [];
      this.cubieMap.clear();
      // 注意：_stickerGeo 共享几何体不在此释放，应用生命周期内复用
    },

    // 重建 cubie 并着色（确保材质面始终对齐世界坐标轴）
    rebuild(faces) {
      this.clearCubies();
      this.buildCubies();
      this.applyFaces(faces);
    },

    // Raycaster 点击检测：返回 { x, y, z, face } 或 null
    // 点击 3D 魔方某个贴纸时，识别是哪个 cubie 的哪个面
    pickSticker(clientX, clientY) {
      if (!this.renderer || !this.camera) return null;
      const rect = this.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, this.camera);

      // 检测所有贴纸 mesh
      const meshes = [];
      for (const c of this.cubies) {
        for (const face in c.stickers) meshes.push(c.stickers[face]);
      }
      const intersects = raycaster.intersectObjects(meshes, false);
      if (!intersects.length) return null;

      const hit = intersects[0];
      const sticker = hit.object;
      const face = sticker.userData.face;
      const key = sticker.userData.cubie;
      const cubie = this.cubieMap.get(key);
      if (!cubie || !face) return null;

      return { x: cubie.x, y: cubie.y, z: cubie.z, face };
    },

    // 转动动画：围绕轴旋转一圈 cubie，然后重新着色
    // duration: 动画时长（毫秒）
    async rotateFace(move, duration = 300) {
      // 解析转动记法：支持外层(R)、宽转动(Rw)、中层(2R)、逆(')、180(2)
      this.isAnimating = true;
      const prime = move.endsWith("'");
      const double = move.endsWith('2');
      const isWide = /w/i.test(move);
      const isSlice = /^2/.test(move);
      const face = move.replace(/^2/, '').replace(/w/ig, '').replace(/'/g, '').replace(/2$/, '')[0];
      const axisMap = {
        U: new THREE.Vector3(0, 1, 0),
        D: new THREE.Vector3(0, -1, 0),
        R: new THREE.Vector3(1, 0, 0),
        L: new THREE.Vector3(-1, 0, 0),
        F: new THREE.Vector3(0, 0, 1),
        B: new THREE.Vector3(0, 0, -1),
      };
      const axis = axisMap[face];
      let angle = Math.PI / 2;
      if (prime) angle = -Math.PI / 2;
      else if (double) angle = Math.PI;

      // 方向校准：3D 场景的坐标约定与求解库的记法约定存在镜像差异。
      // 3×3/2×2：vendor 的 6 个面 90° 转动在场景坐标里均为反向；
      // 4×4/5×5：BigCube 的 U/R/F 反向，D/L/B 同向；180° 正反等价。
      // 必须让动画落点与逻辑状态一致，否则贴纸颜色会随步数累积错位。
      const isBigCube = appState.cubeType === '444' || appState.cubeType === '555';
      const needInvert = isBigCube
        ? (face === 'U' || face === 'R' || face === 'F')
        : true;
      if (needInvert && !double) angle = -angle;

      // 找出该层（外层 / 宽转动两层 / 中层一层）
      const coordKey = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' }[face];
      const maxCoord = (getSize() - 1) / 2;
      const faceDir = { U: 1, D: -1, R: 1, L: -1, F: 1, B: -1 }[face];
      const layerVals = [];
      if (isSlice) layerVals.push(faceDir * (maxCoord - 1));
      else if (isWide) { layerVals.push(faceDir * maxCoord, faceDir * (maxCoord - 1)); }
      else layerVals.push(faceDir * maxCoord);
      const layerCubies = this.cubies.filter(c => layerVals.includes(c[coordKey]));

      const pivot = new THREE.Group();
      this.scene.add(pivot);
      for (const c of layerCubies) {
        pivot.attach(c.group);
      }

      return new Promise((resolve) => {
        const start = performance.now();
        let lastAngle = 0;

        const step = (now) => {
          const t = Math.min((now - start) / duration, 1);
          const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          const cur = angle * eased;
          const delta = cur - lastAngle;
          pivot.rotateOnAxis(axis, delta);
          lastAngle = cur;

          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            pivot.updateMatrixWorld(true);
            const cubieStep = getCubieStep();
            const faceDir = { R: [1, 0, 0], L: [-1, 0, 0], U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1] };
            const dirFace = { '1,0,0': 'R', '-1,0,0': 'L', '0,1,0': 'U', '0,-1,0': 'D', '0,0,1': 'F', '0,0,-1': 'B' };
            const oldKeys = layerCubies.map(c => `${c.x},${c.y},${c.z}`);
            for (let i = 0; i < layerCubies.length; i++) {
              const c = layerCubies[i];
              const wp = new THREE.Vector3();
              c.group.getWorldPosition(wp);
              // 逻辑坐标：除以 step 后取整（×2 保留 0.5 半整数阶坐标）
              const rx = Math.round(wp.x / cubieStep * 2) / 2;
              const ry = Math.round(wp.y / cubieStep * 2) / 2;
              const rz = Math.round(wp.z / cubieStep * 2) / 2;
              this.scene.attach(c.group);

              // 关键：把这一层的旋转「烘焙」到贴纸 mesh 上，让颜色跟着方块一起转动，
              // 而不是动画结束后整盘重绘（那会造成跳色/闪烁）。
              const q = c.group.quaternion.clone().normalize();
              const remapped = {};
              for (const [oldFace, mesh] of Object.entries(c.stickers)) {
                mesh.position.applyQuaternion(q);
                mesh.quaternion.premultiply(q);
                const d = faceDir[oldFace] || [0, 0, 1];
                const n = new THREE.Vector3(d[0], d[1], d[2]).applyQuaternion(q);
                const newFace = dirFace[`${Math.round(n.x)},${Math.round(n.y)},${Math.round(n.z)}`] || oldFace;
                mesh.userData.face = newFace;
                mesh.userData.cubie = `${rx},${ry},${rz}`;
                remapped[newFace] = mesh;
              }
              c.stickers = remapped;

              c.group.position.set(rx * cubieStep, ry * cubieStep, rz * cubieStep);
              c.group.rotation.set(0, 0, 0);
              // 更新 cubie 记录坐标（逻辑坐标）
              c.x = rx; c.y = ry; c.z = rz;
              this.cubieMap.delete(oldKeys[i]);
            }
            for (const c of layerCubies) this.cubieMap.set(`${c.x},${c.y},${c.z}`, c);
            this.scene.remove(pivot);
            this.isAnimating = false;
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    },

    animate() {
      if (this.controls) this.controls.update();
      if (this.renderer) this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(() => this.animate());
    },

    resize() {
      if (!this.container || !this.renderer) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w && h) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
      }
    },

    // 根据系统主题设置 3D 场景背景色
    applyThemeBackground() {
      if (!this.scene) return;
      const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.scene.background = new THREE.Color(isDark ? 0x15171e : 0xf2f2f5);
    },
  };

  // ===================== Tab 切换 =====================
  function switchTab(tab) {
    // Do not leave camera streaming when the user moves away from the scanner.
    if (appState.currentTab === 'scan' && tab !== 'scan' && Scanner.isCameraOn()) {
      Scanner.stopCamera();
      $('#btnCamera').textContent = '开启摄像头';
      if ($('#previewImg').style.display !== 'block') $('#videoPlaceholder').style.display = 'flex';
    }
    appState.currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => {
      const active = t.dataset.tab === tab;
      t.classList.toggle('active', active);
      if (active) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
    if (tab === 'solve') {
      setTimeout(() => {
        // 切到 3D 教学时确保渲染器已初始化
        if (typeof window.THREE !== 'undefined') {
          ThreeRenderer.init($('#cubeContainer'));
          if (!appState.solution.length) {
            // 没有求解结果时，进入 DIY 模式：显示已还原魔方供涂色
            enterDiyMode();
          }
          ThreeRenderer.resize();
        }
      }, 100);
    }
  }

  // ===================== 计时器 =====================
  function initTimer() {
    const display = $('#timerDisplay');
    const state = $('#timerState');
    let rafId = null;
    let startTime = 0;

    function updateDisplay() {
      if (!appState.timerRunning) return;
      display.textContent = ((performance.now() - startTime) / 1000).toFixed(2);
      rafId = requestAnimationFrame(updateDisplay);
    }

    function refreshStats() {
      const history = Timer.getHistory();
      const stats = Timer.getStats(history);
      $('#bestTime').textContent = Timer.formatTime(stats.best);
      $('#avgTime').textContent = stats.avg != null ? Timer.formatTime(stats.avg) : '--';
      $('#solveCount').textContent = stats.count;
      renderHistory();
    }

    function renderHistory() {
      const list = $('#historyList');
      const history = Timer.getHistory();
      if (!history.length) {
        list.innerHTML = '<li class="empty">还没有记录，完成一次还原后这里会显示成绩</li>';
        return;
      }
      list.innerHTML = history.map((h, i) => {
        const d = new Date(h.date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `<li><span class="time">${Timer.formatTime(h.time)}</span><span class="date">${d}</span><button class="del-btn" data-index="${i}">✕</button></li>`;
      }).join('');
      list.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          Timer.deleteRecord(parseInt(e.target.dataset.index));
          refreshStats();
        });
      });
    }

    function toggleTimer() {
      if (appState.timerRunning) {
        appState.timerRunning = false;
        cancelAnimationFrame(rafId);
        const elapsed = performance.now() - startTime;
        display.textContent = (elapsed / 1000).toFixed(2);
        display.classList.remove('running');
        timerStage.classList.remove('running');
        state.textContent = '已完成，轻点再次开始';
        Timer.addRecord(elapsed);
        refreshStats();
      } else {
        appState.timerRunning = true;
        startTime = performance.now();
        display.classList.add('running');
        timerStage.classList.add('running');
        state.textContent = '计时中，轻点停止';
        updateDisplay();
      }
    }

    function resetTimer() {
      appState.timerRunning = false;
      cancelAnimationFrame(rafId);
      display.textContent = '0.00';
      display.classList.remove('running');
      timerStage.classList.remove('running');
      state.textContent = '轻点开始计时';
    }

    const timerStage = $('#timerStage');
    timerStage.addEventListener('click', toggleTimer);
    $('#btnReset').addEventListener('click', resetTimer);
    $('#btnClearHistory').addEventListener('click', () => {
      if (confirm('确定清空所有历史记录吗？')) { Timer.clearHistory(); refreshStats(); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && appState.currentTab === 'timer') { e.preventDefault(); toggleTimer(); }
    });

    refreshStats();
  }

  // ===================== 扫描 =====================
  function initScanner() {
    const video = $('#video');
    const overlay = $('#overlay');
    const previewImg = $('#previewImg');
    const placeholder = $('#videoPlaceholder');
    const btnClearPreview = $('#btnClearPreview');
    const grid3x3 = $('#grid3x3');
    const palette = $('#palette');
    const faceProgress = $('#faceProgress');
    const currentFaceTitle = $('#currentFaceTitle');
    const btnSolve = $('#btnSolve');

    Scanner.init(video, overlay);
    const detectCanvas = document.createElement('canvas');
    let previewObjectUrl = null;
    let imageLoadSerial = 0;

    const fileLabel = document.querySelector('.file-btn');
    fileLabel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        $('#fileInput').click();
      }
    });

    function renderPalette() {
      palette.innerHTML = Scanner.COLOR_DEFS.map(c =>
        `<button type="button" class="swatch ${c.name}" data-color="${c.name}" style="background:${c.css}" aria-label="设为${c.label}色" title="${c.label}"></button>`
      ).join('');
      palette.querySelectorAll('.swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          if (appState.selectedCell != null) {
            const face = appState.scanOrder[appState.scanIndex];
            const grid = appState.scanFaces[face] || Array(getStickerCount()).fill(null);
            grid[appState.selectedCell] = sw.dataset.color;
            appState.scanFaces[face] = grid;
            renderGrid();
            checkReady();
          }
        });
      });
    }

    function renderProgress() {
      faceProgress.innerHTML = appState.scanOrder.map((face, i) => {
        let cls = 'face-dot';
        if (appState.scanFaces[face]) cls += ' done';
        if (i === appState.scanIndex) cls += ' current';
        return `<button class="${cls}" data-index="${i}">${FACE_NAMES[face]}</button>`;
      }).join('');
      faceProgress.querySelectorAll('.face-dot').forEach(dot => {
        dot.addEventListener('click', () => {
          appState.scanIndex = parseInt(dot.dataset.index);
          appState.selectedCell = null;
          renderProgress(); renderGrid(); updateTitle();
        });
      });
    }

    function updateTitle() {
      currentFaceTitle.textContent = `当前面：${FACE_NAMES[appState.scanOrder[appState.scanIndex]]}`;
    }

    function renderGrid() {
      const face = appState.scanOrder[appState.scanIndex];
      const grid = appState.scanFaces[face] || Array(getStickerCount()).fill(null);
      // 动态设置网格列数（2×2 或 3×3）
      grid3x3.style.gridTemplateColumns = `repeat(${getGridSize()}, 1fr)`;
      grid3x3.innerHTML = grid.map((color, i) => {
        const css = color ? (Scanner.COLOR_DEFS.find(c => c.name === color)?.css || '#333') : '#333';
        const cls = 'cell' + (appState.selectedCell === i ? ' selected' : '');
        return `<button type="button" class="${cls}" data-index="${i}" style="background:${css}" aria-pressed="${appState.selectedCell === i}" aria-label="第${i + 1}格：${color ? (COLOR_KEY_NAME[color] || color) : '未识别'}">${color ? '' : '?'}</button>`;
      }).join('');
      grid3x3.querySelectorAll('.cell').forEach(cell => {
        cell.addEventListener('click', () => {
          appState.selectedCell = parseInt(cell.dataset.index);
          renderGrid();
          grid3x3.querySelector(`[data-index="${appState.selectedCell}"]`)?.focus();
        });
      });
    }

    function checkReady() {
      const ready = appState.scanOrder.every(face => {
        const g = appState.scanFaces[face];
        return g && g.every(c => c && c !== 'black');
      });
      btnSolve.disabled = !ready;
    }

    function applyDetected(result, source) {
      if (!result || !result.colors || result.colors.length !== getStickerCount()) {
        alert(`未能识别出 ${getGridSize()}x${getGridSize()} 网格，请确保魔方完整出现在画面中`);
        return false;
      }
      const face = appState.scanOrder[appState.scanIndex];

      // 保存原始 cell 数据（含 hsv），供后续全局平衡纠错
      if (result.cells && result.cells.length === getStickerCount()) {
        appState.scanCells[face] = result.cells;
      }

      // 核心改进：3×3 用"中心块锚定"分类（抗光照）；2×2 无中心块，直接逐格分类
      let colors = result.colors;
      if (appState.cubeType !== '222' && result.cells && Scanner.classifyFaceConstrained) {
        const constrained = Scanner.classifyFaceConstrained(result.cells);
        if (constrained && constrained.length === getStickerCount()) {
          colors = constrained;
        }
      }

      // 黑色未识别格子置为 null，等待用户手动修正
      const normalized = colors.map(c => (c === 'black' ? null : c));
      const recognizedCount = normalized.filter(c => c).length;
      appState.scanFaces[face] = normalized;
      // 记录自动识别结果（未识别的记为 null），用于区分"用户手改"
      appState.scanAutoFaces[face] = normalized.slice();
      renderGrid();
      checkReady();

      // 在取景框上绘制识别覆盖层
      if (result.cells && source) {
        drawOverlayOnSource(result, source);
      }

      // 反馈：识别了几格
      if (recognizedCount < getStickerCount()) {
        toast(`已识别 ${recognizedCount}/${getStickerCount()} 格，点未识别格子手动补色`, 'warn');
      } else {
        toast(`${FACE_NAMES[face]}识别完成`, 'ok');
      }

      // 满 6 面后，尝试全局平衡纠错（3×3 每种颜色 9 块；2×2 每种 4 块）
      tryGlobalBalance();
      return true;
    }

    // 收集满 6 面后，用"9 色平衡分配"全局纠正误判
    function tryGlobalBalance() {
      // 全局平衡纠错目前仅支持 3×3（需中心块锚定）
      if (appState.cubeType !== '333') return;
      if (!Scanner.balanceGlobalColors) return;
      const allDone = appState.scanOrder.every(face => appState.scanCells[face] && appState.scanCells[face].length === 9);
      if (!allDone) return;

      const corrected = Scanner.balanceGlobalColors(appState.scanCells);
      if (!corrected) return;

      // 用纠正结果覆盖。用户手动改过的格子优先：只有当前为 null（未识别）
      // 或仍是自动识别结果的格子才被纠正。
      let changed = 0;
      appState.scanOrder.forEach(face => {
        const cur = appState.scanFaces[face];
        const auto = appState.scanAutoFaces[face];
        if (!cur) return;
        corrected[face].forEach((color, idx) => {
          // 该格是"用户手动填的"（存在且与自动结果不同），跳过
          const isManual = cur[idx] && auto && auto[idx] !== cur[idx];
          if (isManual) return;
          if (cur[idx] !== color) changed++;
          cur[idx] = color;
        });
      });

      if (changed > 0) {
        renderGrid();
        toast(`已用全局约束纠正 ${changed} 处颜色`, 'ok');
      }
    }

    // 把识别覆盖层绘制到取景框画布上（支持视频和上传的照片）
    function drawOverlayOnSource(result, source) {
      const vw = source.videoWidth || source.naturalWidth || source.width;
      const vh = source.videoHeight || source.naturalHeight || source.height;
      if (!vw || !vh) return;
      overlay.width = vw;
      overlay.height = vh;
      Scanner.drawGridOverlay(overlay, result);
      overlay.style.opacity = '1';
      // 2.5 秒后淡出
      clearTimeout(appState.overlayTimer);
      appState.overlayTimer = setTimeout(() => {
        overlay.style.opacity = '0';
      }, 2500);
    }

    // 轻提示
    function toast(msg, type = 'ok') {
      let el = $('#scanToast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'scanToast';
        el.className = 'scan-toast';
        document.querySelector('#panel-scan').appendChild(el);
      }
      el.textContent = msg;
      el.className = 'scan-toast ' + (type === 'warn' ? 'warn' : 'ok');
      el.classList.add('show');
      clearTimeout(appState.toastTimer);
      appState.toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
    }

    function advanceFace() {
      if (appState.scanIndex < 5) {
        appState.scanIndex++;
        appState.selectedCell = null;
        renderProgress(); renderGrid(); updateTitle();
      }
    }

    // 显示上传照片预览，隐藏摄像头
    function showPreview(img, objectUrl) {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = objectUrl;
      previewImg.src = objectUrl;
      previewImg.style.display = 'block';
      btnClearPreview.classList.add('show');
      placeholder.style.display = 'none';
      // 如果摄像头还开着，先关掉，避免资源占用
      if (Scanner.isCameraOn()) {
        Scanner.stopCamera();
        $('#btnCamera').textContent = '开启摄像头';
      }
      // 隐藏 video，避免叠在预览图上方
      video.style.display = 'none';
    }

    // 清除照片预览，回到初始状态
    function clearPreview() {
      // Invalidate in-flight image loads and release any previous Blob URL.
      imageLoadSerial++;
      previewImg.style.display = 'none';
      previewImg.removeAttribute('src');
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }
      btnClearPreview.classList.remove('show');
      overlay.style.opacity = '0';
      if (!Scanner.isCameraOn()) {
        placeholder.style.display = 'flex';
      }
      video.style.display = '';
    }

    $('#btnCapture').addEventListener('click', () => {
      // 优先识别预览图（用户上传的照片），否则识别摄像头
      if (previewImg.style.display === 'block' && previewImg.src) {
        const img = previewImg;
        if (img.naturalWidth && img.naturalHeight) {
          if (applyDetected(Scanner.detectGrid(img, detectCanvas, getGridSize()), img)) advanceFace();
          return;
        }
      }
      if (!Scanner.isCameraOn()) { alert('请先开启摄像头或上传照片'); return; }
      if (applyDetected(Scanner.detectGrid(video, detectCanvas, getGridSize()), video)) advanceFace();
    });

    $('#btnCamera').addEventListener('click', async () => {
      if (Scanner.isCameraOn()) {
        Scanner.stopCamera();
        placeholder.style.display = 'flex';
        $('#btnCamera').textContent = '开启摄像头';
      } else {
        const ok = await Scanner.startCamera();
        if (ok) {
          // 开启摄像头时，清除上传照片预览
          clearPreview();
          placeholder.style.display = 'none';
          video.style.display = '';
          $('#btnCamera').textContent = '关闭摄像头';
        } else {
          alert('摄像头开启失败，请检查权限');
        }
      }
    });

    $('#fileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      // 校验文件类型
      if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        e.target.value = '';
        return;
      }
      loadUploadedImage(file, (img) => {
        // 显示预览
        showPreview(img, img.src);
        // 识别并自动切下一面（仅识别成功时）
        if (applyDetected(Scanner.detectGrid(img, detectCanvas, getGridSize()), img)) advanceFace();
      });
      e.target.value = '';
    });

    // 加载上传图片。现代浏览器已自动应用 EXIF 方向
    // （image-orientation 默认 from-image），无需手动旋转。
    function loadUploadedImage(file, cb) {
      const serial = ++imageLoadSerial;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (serial !== imageLoadSerial) {
          URL.revokeObjectURL(url);
          return;
        }
        // Keep this URL alive only while the preview is displayed.
        cb(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (serial === imageLoadSerial) alert('图片加载失败，请重新选择');
      };
      img.src = url;
    }

    btnClearPreview.addEventListener('click', clearPreview);

    $('#btnResetScan').addEventListener('click', () => {
      appState.scanFaces = {};
      appState.scanCells = {};
      appState.scanAutoFaces = {};
      appState.scanIndex = 0;
      appState.selectedCell = null;
      clearPreview();
      renderProgress(); renderGrid(); updateTitle(); checkReady();
    });

    btnSolve.addEventListener('click', startSolve);

    renderPalette(); renderProgress(); renderGrid(); updateTitle(); checkReady();
  }

  // ===================== 求解 + 3D =====================
  // 从 3×3 cubeState 提取当前魔方类型所需的 faces（2×2 只取角块）
  function facesForCurrentType(cubeState) {
    const faces9 = cs().facesFromCube(cubeState);
    if (appState.cubeType === '222') {
      const cornerIdx = [0, 2, 6, 8];
      const result = {};
      for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
        result[face] = cornerIdx.map(i => faces9[face][i]);
      }
      return result;
    }
    return faces9;
  }

  // 求解分派（根据魔方类型）
  function solveCurrent(faces) {
    if (appState.cubeType === '222') return Solver.solve2x2(faces);
    if (appState.cubeType === '444') return Solver.solve4x4(faces);
    if (appState.cubeType === '555') {
      throw new Error('五阶的降阶法求解器仍在开发中，敬请期待');
    }
    return Solver.solve(faces);
  }

  // ===================== 后台求解（4×4 重计算不冻结 UI） =====================
  let solveWorker = null;
  let solveReqId = 0;
  let solving = false;

  function getSolveWorker() {
    if (solveWorker) return solveWorker;
    try { solveWorker = new Worker('./solver-worker.js'); } catch (e) { solveWorker = null; }
    return solveWorker;
  }

  function showSolveProgress(label, cur, total) {
    let el = document.getElementById('solveProgress');
    if (!el) {
      el = document.createElement('div');
      el.id = 'solveProgress';
      el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(8,10,16,.72);backdrop-filter:blur(3px)';
      el.innerHTML = '<div style="min-width:270px;max-width:86vw;padding:24px 28px;border-radius:16px;background:#1c202b;color:#f2f4f8;box-shadow:0 18px 50px rgba(0,0,0,.5);text-align:center;font:14px/1.6 system-ui,-apple-system,sans-serif">'
        + '<div style="font-size:17px;font-weight:600;margin-bottom:6px">正在求解四阶魔方…</div>'
        + '<div id="solveProgressLabel" style="opacity:.78;margin-bottom:14px">准备中</div>'
        + '<div style="height:6px;border-radius:6px;background:#333a4a;overflow:hidden"><div id="solveProgressBar" style="height:100%;width:5%;border-radius:6px;background:linear-gradient(90deg,#4f8cff,#7a6bff);transition:width .25s"></div></div>'
        + '<div style="margin-top:12px;font-size:12px;opacity:.55">首次计算约需 5–30 秒，期间页面不会卡住</div></div>';
      document.body.appendChild(el);
    }
    const lbl = document.getElementById('solveProgressLabel');
    const bar = document.getElementById('solveProgressBar');
    if (lbl) lbl.textContent = label || '计算中…';
    if (bar) bar.style.width = Math.max(5, Math.min(100, Math.round((cur / (total || 3)) * 100))) + '%';
  }
  function hideSolveProgress() {
    const el = document.getElementById('solveProgress');
    if (el) el.remove();
  }

  // 统一异步求解入口：4×4 走 Worker，其余走主线程（保持原有行为）
  function solveAsync(faces) {
    const isBig = appState.cubeType === '444';
    if (!isBig) { appState.solveSource = ''; return Promise.resolve().then(() => solveCurrent(faces)); }

    // 应用内随机打乱且状态未被手工改动：直接用打乱序列的逆还原（瞬时且必然正确）。
    // 这不是通用求解器，界面会如实标注；任何手工涂色/扫描输入都走下面的降阶求解。
    const sm = appState.scrambleMoves, sf = appState.scrambleFaces;
    if (sm && sm.length && sf && sf.U && sf.U.length === faces.U.length) {
      let same = true;
      for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) {
        if (!faces[f] || !sf[f]) { same = false; break; }
        for (let i = 0; i < faces[f].length; i++) {
          if (faces[f][i] !== sf[f][i]) { same = false; break; }
        }
        if (!same) break;
      }
      if (same) {
        appState.solveSource = 'inverse';
        const inverse = sm.slice().reverse().map(m =>
          m.endsWith("'") ? m.slice(0, -1) : (m.endsWith('2') ? m : m + "'"));
        return Promise.resolve(inverse);
      }
    }
    appState.solveSource = 'solver';

    return new Promise((resolve, reject) => {
      showSolveProgress('准备中…', 0, 3);
      const w = getSolveWorker();
      const fallback = () => setTimeout(() => {
        try { resolve(solveCurrent(faces)); } catch (e) { reject(e); }
      }, 40);
      if (!w) { fallback(); return; }
      const id = ++solveReqId;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true; cleanup(); reject(new Error('求解超时，请重试或刷新页面'));
      }, 180000);
      const handler = (ev) => {
        const d = ev.data || {};
        if (d.id !== id || settled) return;
        if (d.type === 'progress') { showSolveProgress(d.label, d.cur, d.total); return; }
        settled = true; cleanup();
        if (d.type === 'error') reject(new Error(d.message));
        else if (d.type === 'done') resolve(d.solution);
        else reject(new Error('后台求解返回了未知消息'));
      };
      function cleanup() { clearTimeout(timer); w.removeEventListener('message', handler); }
      w.addEventListener('message', handler);
      w.onerror = () => { if (settled) return; settled = true; cleanup(); fallback(); };
      try { w.postMessage({ id, faces, cubeType: '444' }); }
      catch (e) { if (!settled) { settled = true; cleanup(); fallback(); } }
    });
  }
  function validateCurrent(faces) {
    if (appState.cubeType === '222') return Solver.validateFaces2x2(faces);
    if (appState.cubeType === '444' || appState.cubeType === '555') {
      const n = appState.cubeType === '444' ? 4 : 5;
      const perColor = n * n;
      const counts = {};
      for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
        const grid = faces[face];
        if (!grid || grid.length !== perColor) return { valid: false, msg: `面 ${face} 数据不完整` };
        for (const color of grid) {
          if (!color) return { valid: false, msg: `面 ${face} 存在未识别的格子` };
          counts[color] = (counts[color] || 0) + 1;
        }
      }
      for (const color of Object.keys(counts)) {
        if (counts[color] !== perColor) return { valid: false, msg: `颜色 ${color} 出现了 ${counts[color]} 次，应为 ${perColor} 次` };
      }
      return { valid: true };
    }
    return Solver.validateFaces(faces);
  }

  async function startSolve() {
    if (solving) return;
    const validation = validateCurrent(appState.scanFaces);
    if (!validation.valid) { alert(validation.msg); return; }
    if (typeof window.cubeSolverModule === 'undefined') { alert('求解库加载中，请稍后重试'); return; }

    solving = true;
    try {
      const solution = await solveAsync(appState.scanFaces);
      appState.solution = solution;
      appState.currentStep = -1;
      switchTab('solve');
      initSolveView(solution);
      $('#solveMoveCount').textContent = `步骤数：${solution.length}`;
    } catch (err) {
      console.error(err);
      const perColor = getStickerCount();
      alert(`求解失败：${err.message}\n请检查各面颜色是否正确（每种颜色应恰好出现 ${perColor} 次）。\n\n常见原因：某个面识别反了，或颜色计数不对。`);
    } finally {
      solving = false;
      hideSolveProgress();
    }
  }

  function initSolveView(solution) {
    const container = $('#cubeContainer');
    ThreeRenderer.init(container);

    if (appState.cubeType === '444' || appState.cubeType === '555') {
      // 大魔方：打乱态 = 还原态 + solution 的逆（用 BigCube 构建）
      const n = getSize();
      const faceToColor = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };
      const solvedFaces = {};
      for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) solvedFaces[f] = Array(n * n).fill(faceToColor[f]);
      const bigState = BigCube.buildState(n, solvedFaces);
      const inverseSolution = solution.slice().reverse().map(m => m.endsWith("'") ? m.slice(0, -1) : (m.endsWith('2') ? m : m + "'"));
      for (const m of inverseSolution) BigCube.applyMove(bigState, m, n);
      appState.bigCubeState = bigState;
      appState.diyFaces = BigCube.stateToFaces(bigState, n);
      ThreeRenderer.clearCubies();
      ThreeRenderer.buildCubies();
      applyDiyFacesTo3D();
    } else {
      // 用 vendor 库构建"打乱态"cube
      // solution 是"从打乱到还原"的步骤，所以打乱态 = 还原态 + solution 的逆
      const vendorMoves = solution.map(toVendorMove);
      const inverseVendor = vendorMoves.slice().reverse().map(m => {
        if (m.endsWith('_PRIME')) return m.slice(0, -6);
        if (m.endsWith('2')) return m;
        return m + '_PRIME';
      });

      // 打乱态 cube（还原态 + 逆解）
      appState.cubeState = cs().cubeFromMoves(inverseVendor);

      // 重建并着色显示打乱态
      ThreeRenderer.rebuild(facesForCurrentType(appState.cubeState));
    }

    renderSolveList();
    updateStepDisplay();
    // 如实标注解法来源：应用内打乱的逆序列 ≠ 通用降阶求解
    if (appState.solveSource === 'inverse') {
      const el = $('#solveStep');
      if (el) el.innerHTML = '<div class="step-index">应用内随机打乱</div>'
        + '<div class="step-move">已用打乱序列的逆序还原</div>'
        + '<div class="step-desc">该路径未调用通用降阶求解器；手工涂色或扫描输入会自动改用降阶求解。</div>';
    }
    updateSolveSubtitle();
    toggleSolveUi();
  }

  // ===================== DIY 填色模式 =====================
  // 进入 DIY 模式：显示已还原魔方供用户自由涂色
  function enterDiyMode(rebuildCubies = false) {
    // 若 diyFaces 为空，初始化为已还原状态（每面都是自己的标准色）
    if (!appState.diyFaces || Object.keys(appState.diyFaces).length === 0) {
      resetDiyFaces();
    }
    // 切换魔方类型后 cubie 数量变化，需重建；或自动检测数量不匹配
    const n = getSize();
    const expected = n % 2 === 0 ? n * n * n : n * n * n - 1;
    if (rebuildCubies || ThreeRenderer.cubies.length !== expected) {
      ThreeRenderer.clearCubies();
      ThreeRenderer.buildCubies();
    }
    // 用 diyFaces 构建 3D 显示
    applyDiyFacesTo3D();
    // 渲染颜色面板
    renderDiyColors();
    // 更新提示
    updateSolveSubtitle();
    toggleSolveUi();
  }

  // 重置 diyFaces 为已还原状态
  function resetDiyFaces() {
    const faceToColor = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };
    const count = getStickerCount();
    appState.diyFaces = {};
    for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
      appState.diyFaces[face] = Array(count).fill(faceToColor[face]);
    }
    appState.selectedColor = null;
  }

  // 把 diyFaces（颜色 key 网格）渲染到 3D
  function applyDiyFacesTo3D() {
    // diyFaces 存的是颜色 key（white/yellow/...），直接遍历设置贴纸颜色
    const positions = stickerPosFor(appState.cubeType);
    for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
      const stickers = appState.diyFaces[face];
      const posList = positions[face];
      for (let i = 0; i < posList.length; i++) {
        const colorKey = stickers[i];
        const [x, y, z] = posList[i];
        const cubie = ThreeRenderer.cubieMap.get(`${x},${y},${z}`);
        if (!cubie) continue;
        const stickerMesh = cubie.stickers[face];
        if (stickerMesh && colorKey) {
          stickerMesh.material.color.set(COLOR_KEY_CSS[colorKey]);
        }
      }
    }
  }

  // 渲染 DIY 颜色面板
  function renderDiyColors() {
    const el = $('#diyColors');
    el.innerHTML = COLOR_KEYS.map(key =>
      `<button type="button" class="diy-swatch ${appState.selectedColor === key ? 'active' : ''}" data-color="${key}" style="background:${COLOR_KEY_CSS[key]}" title="${COLOR_KEY_NAME[key]}" aria-pressed="${appState.selectedColor === key}" aria-label="选取${COLOR_KEY_NAME[key]}色"></button>`
    ).join('');
    el.querySelectorAll('.diy-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        const color = sw.dataset.color;
        appState.selectedColor = appState.selectedColor === color ? null : color;
        renderDiyColors();
        updateDiyHint();
      });
    });
  }

  function updateDiyHint() {
    const hint = $('#diyHint');
    if (appState.selectedColor) {
      hint.textContent = `已选「${COLOR_KEY_NAME[appState.selectedColor]}」，点击魔方贴纸涂色`;
      hint.style.color = '#fff';
    } else {
      hint.textContent = '先选一个颜色，再点魔方贴纸涂色';
      hint.style.color = '';
    }
  }

  // 随机打乱魔方（3×3/2×2 用 vendor 库，4×4/5×5 用 BigCube）
  function scrambleCube() {
    if (appState.cubeType === '444' || appState.cubeType === '555') {
      scrambleBigCube();
    } else {
      scrambleSmallCube();
    }
  }

  function scrambleSmallCube() {
    if (typeof window.cubeSolverModule === 'undefined') { alert('求解库加载中，请稍后重试'); return; }
    appState.scrambleMoves = null;
    appState.scrambleFaces = null;
    const is2x2 = appState.cubeType === '222';
    let moves = Solver.generateScramble(20);
    if (is2x2) {
      // 2×2 角块必须偶置换：90° 转动总数须为偶数，否则会出现 ParityError
      const qCount = moves.filter(m => !m.endsWith('2')).length;
      if (qCount % 2 === 1) {
        moves.push('U'); // 补一个 90°（奇置换）使 90° 总数变为偶数
      }
    }
    const vendorMoves = moves.map(toVendorMove);
    const scrambled = cs().cubeFromMoves(vendorMoves);
    const faces9 = cs().facesFromCube(scrambled);
    const letterToKey = { U: 'white', D: 'yellow', R: 'red', L: 'orange', F: 'green', B: 'blue' };
    appState.diyFaces = {};
    for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) {
      if (is2x2) {
        const cornerIdx = [0, 2, 6, 8];
        appState.diyFaces[f] = cornerIdx.map(i => letterToKey[faces9[f][i]]);
      } else {
        appState.diyFaces[f] = faces9[f].map(l => letterToKey[l]);
      }
    }
    finishScramble('已随机打乱，点击「一键还原」求解');
  }

  function scrambleBigCube() {
    const n = getSize();
    const faceToColor = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };
    const solvedFaces = {};
    for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) solvedFaces[f] = Array(n * n).fill(faceToColor[f]);
    const state = BigCube.buildState(n, solvedFaces);
    const scramble = generateBigCubeScramble(n);
    for (const m of scramble) BigCube.applyMove(state, m, n);
    appState.diyFaces = BigCube.stateToFaces(state, n);
    appState.scrambleMoves = scramble.slice();
    appState.scrambleFaces = JSON.parse(JSON.stringify(appState.diyFaces));
    finishScramble('已随机打乱');
  }

  function generateBigCubeScramble(n) {
    const faces = ['U', 'D', 'R', 'L', 'F', 'B'];
    const types = ['', "'", '2'];
    const moves = [];
    let last = '';
    for (let i = 0; i < 30; i++) {
      let m;
      do {
        const f = faces[Math.floor(Math.random() * 6)];
        const t = types[Math.floor(Math.random() * 3)];
        const kind = Math.random();
        if (kind < 0.4) m = f + t;
        else if (kind < 0.7) m = '2' + f + t;
        else m = f + 'w' + t;
      } while (m[0] === last);
      last = m[0];
      moves.push(m);
    }
    return moves;
  }

  function finishScramble(hintText) {
    appState.solution = [];
    appState.currentStep = -1;
    appState.cubeState = null;
    applyDiyFacesTo3D();
    updateSolveSubtitle();
    toggleSolveUi();
    $('#solveMoveCount').textContent = '步骤数：--';
    $('#solveList').innerHTML = '';
    $('#solveStep').innerHTML = hintText;
  }

  // 处理贴纸上色
  function paintSticker(pick) {
    if (!appState.selectedColor) return false;
    const { x, y, z, face } = pick;
    const idx = stickerIndexOf(face, x, y, z);
    if (idx < 0) return false;
    // 禁止涂中心块（中心块颜色固定，决定面身份）。仅奇数阶有唯一中心贴纸；
    // 偶数阶（2×2/4×4）无单一中心，DIY 自由涂色不做限制。
    const n = getSize();
    const centerIdx = (n % 2 === 1) ? Math.floor(n * n / 2) : -1;
    if (idx === centerIdx) return false;
    appState.diyFaces[face][idx] = appState.selectedColor;
    // 立即更新 3D 该贴纸颜色
    const cubie = ThreeRenderer.cubieMap.get(`${x},${y},${z}`);
    const stickerMesh = cubie.stickers[face];
    if (stickerMesh) {
      stickerMesh.material.color.set(COLOR_KEY_CSS[appState.selectedColor]);
    }
    return true;
  }

  // 从 diyFaces 求解并进入还原播放
  async function solveFromDiy() {
    if (solving) return;
    const validation = validateCurrent(appState.diyFaces);
    if (!validation.valid) { alert(validation.msg); return; }
    if (typeof window.cubeSolverModule === 'undefined') { alert('求解库加载中，请稍后重试'); return; }

    solving = true;
    try {
      const solution = await solveAsync(appState.diyFaces);
      appState.solution = solution;
      appState.currentStep = -1;
      initSolveView(solution);
      $('#solveMoveCount').textContent = `步骤数：${solution.length}`;
    } catch (err) {
      console.error(err);
      const perColor = getStickerCount();
      alert(`求解失败：${err.message}\n请检查涂色是否正确（每种颜色应恰好出现 ${perColor} 次）。`);
    } finally {
      solving = false;
      hideSolveProgress();
    }
  }

  // 更新副标题（区分 DIY 模式和播放模式）
  function updateSolveSubtitle() {
    const sub = $('#solveSubtitle');
    if (appState.solution.length) {
      sub.textContent = `共 ${appState.solution.length} 步，跟随动画还原`;
    } else {
      sub.textContent = '点选颜色，点击魔方贴纸自由涂色，一键自动还原';
    }
  }

  // 根据是否已求解，切换 UI（DIY 阶段 vs 播放阶段）
  function toggleSolveUi() {
    const hasSolution = appState.solution.length > 0;
    const btnSolveDIY = $('#btnSolveDIY');
    const solvePanel = document.querySelector('.solve-panel');
    if (btnSolveDIY) btnSolveDIY.style.display = hasSolution ? 'none' : '';
    if (solvePanel) solvePanel.style.display = hasSolution ? '' : 'none';
  }

  function renderSolveList() {
    const list = $('#solveList');
    list.innerHTML = appState.solution.map((m, i) =>
      `<span class="move-item" data-step="${i}">${m}</span>`
    ).join('');
    list.querySelectorAll('.move-item').forEach(item => {
      item.addEventListener('click', () => goToStep(parseInt(item.dataset.step)));
    });
  }

  function updateStepDisplay() {
    const el = $('#solveStep');
    const total = appState.solution.length;
    if (appState.currentStep < 0) {
      el.innerHTML = `<div><div class="step-index">准备开始</div><div class="step-move">${total} 步还原</div><div class="step-desc">点击「自动还原」开始演示</div></div>`;
    } else if (appState.currentStep >= total) {
      el.innerHTML = `<div><div class="step-index">完成</div><div class="step-move">已还原 🎉</div><div class="step-desc">恭喜，魔方已全部还原</div></div>`;
    } else {
      const m = appState.solution[appState.currentStep];
      const desc = moveToDescription(m);
      el.innerHTML = `<div><div class="step-index">第 ${appState.currentStep + 1} / ${total} 步 · ${m}</div><div class="step-move">${desc}</div></div>`;
    }
    document.querySelectorAll('.move-item').forEach(item => {
      item.classList.toggle('active', parseInt(item.dataset.step) === appState.currentStep);
    });
  }

  // 步骤串行队列：任意「下一步/上一步/跳到某步」都串入同一链条，
  // 保证一次只有一个转动在执行，避免快速连点或自动播放时多个 rotateFace 重叠
  // 导致 cubieMap 坐标被并发覆盖（表现就是「跳色/颜色错位」）。
  let _stepChain = Promise.resolve();
  function runSequenced(fn) {
    const run = _stepChain.then(fn);
    // 吸收异常，避免单个步骤失败拖垮后续链条
    _stepChain = run.catch((e) => { console.error('[step] 执行异常', e); });
    return run;
  }

  async function goToStep(step) {
    const target = Math.max(-1, Math.min(appState.solution.length, step));
    await runSequenced(async () => {
      while (appState.currentStep < target) {
        appState.currentStep++;
        if (appState.currentStep < appState.solution.length) await doStep(appState.currentStep);
      }
      while (appState.currentStep > target) {
        const k = appState.currentStep;
        const undoIdx = k >= appState.solution.length ? appState.solution.length - 1 : k;
        await undoStepOf(undoIdx);
        appState.currentStep = undoIdx - 1;
      }
      updateStepDisplay();
    });
  }

  async function doStep(idx) {
    const move = appState.solution[idx];
    if (!move) return; // 越界保护：完成态没有可播放的动作
    // 播放动画（时长用当前速度设置）
    await ThreeRenderer.rotateFace(move, appState.solveSpeed);
    // 动画期间可能被「重置」清空状态，此处需保护
    if (appState.cubeType === '444' || appState.cubeType === '555') {
      if (!appState.bigCubeState) return;
      const n = getSize();
      BigCube.applyMove(appState.bigCubeState, move, n);
      appState.diyFaces = BigCube.stateToFaces(appState.bigCubeState, n);
      // 贴纸颜色已随方块转动；此处只做原地校验/校准，绝不重建 mesh
      ThreeRenderer.syncFaces(appState.diyFaces, 'key');
    } else {
      if (!appState.cubeState) return;
      appState.cubeState = cs().applyMoves(appState.cubeState, [toVendorMove(move)]);
      ThreeRenderer.syncFaces(facesForCurrentType(appState.cubeState), 'letter');
    }
  }

  // 撤销第 idx 步（仅转动 + 回退状态，不管理 currentStep，由调用方负责）
  async function undoStepOf(idx) {
    const total = appState.solution.length;
    const realIdx = idx >= total ? total - 1 : idx;
    if (realIdx < 0) return;
    const move = appState.solution[realIdx];
    if (!move) return;
    const inv = move.endsWith("'") ? move.slice(0, -1) : (move.endsWith('2') ? move : move + "'");
    await ThreeRenderer.rotateFace(inv, appState.solveSpeed);
    if (appState.cubeType === '444' || appState.cubeType === '555') {
      if (!appState.bigCubeState) return;
      const n = getSize();
      BigCube.applyMove(appState.bigCubeState, inv, n);
      appState.diyFaces = BigCube.stateToFaces(appState.bigCubeState, n);
      ThreeRenderer.syncFaces(appState.diyFaces, 'key');
    } else {
      if (!appState.cubeState) return;
      appState.cubeState = cs().applyMoves(appState.cubeState, [toVendorMove(inv)]);
      ThreeRenderer.syncFaces(facesForCurrentType(appState.cubeState), 'letter');
    }
  }

  async function nextStep() {
    const total = appState.solution.length;
    if (appState.currentStep >= total) return;
    const idx = appState.currentStep + 1;
    // 同步提交索引，避免并发点击重复播放同一步
    appState.currentStep = idx;
    await runSequenced(async () => {
      // 最后一步之后进入「完成」显示态，不再重复转动
      if (idx < total) await doStep(idx);
      updateStepDisplay();
    });
  }

  async function prevStep() {
    const total = appState.solution.length;
    if (appState.currentStep < 0) return;
    // 当前已播放到的「步」对应的动作索引：完成态(currentStep===total)撤销最后一步 total-1
    const undoIdx = appState.currentStep >= total ? total - 1 : appState.currentStep;
    // 先同步回退索引，再在串行链中执行反转动画
    appState.currentStep = undoIdx - 1;
    await runSequenced(async () => {
      if (undoIdx >= 0) await undoStepOf(undoIdx);
      updateStepDisplay();
    });
  }

  // 自动播放：链式调度（动画播完一步 → 播下一步）
  let autoPlaying = false;
  function toggleAutoPlay() {
    if (appState.autoPlayTimer || autoPlaying) {
      // 停止
      autoPlaying = false;
      if (appState.autoPlayTimer) {
        clearTimeout(appState.autoPlayTimer);
        appState.autoPlayTimer = null;
      }
      $('#btnAutoPlay').textContent = '自动还原';
      return;
    }
    // 开始
    autoPlaying = true;
    $('#btnAutoPlay').textContent = '暂停';
    playNextAuto();
  }

  async function playNextAuto() {
    if (!autoPlaying) return;
    if (appState.currentStep >= appState.solution.length) {
      autoPlaying = false;
      appState.autoPlayTimer = null;
      $('#btnAutoPlay').textContent = '自动还原';
      return;
    }
    await nextStep();
    if (!autoPlaying) return;
    // 动画播完后短暂停顿再播下一步
    appState.autoPlayTimer = setTimeout(() => {
      appState.autoPlayTimer = null;
      playNextAuto();
    }, 200);
  }

  function initSolveControls() {
    $('#btnNext').addEventListener('click', nextStep);
    $('#btnPrev').addEventListener('click', prevStep);
    $('#btnAutoPlay').addEventListener('click', () => {
      if (!appState.solution.length) {
        // 没有求解结果时，先触发一键还原
        solveFromDiy();
        return;
      }
      toggleAutoPlay();
    });
    $('#btnResetSolve').addEventListener('click', () => {
      // 停止自动播放
      autoPlaying = false;
      if (appState.autoPlayTimer) {
        clearTimeout(appState.autoPlayTimer);
        appState.autoPlayTimer = null;
      }
      $('#btnAutoPlay').textContent = '自动还原';
      // 清空求解结果，回到 DIY 模式
      appState.solution = [];
      appState.currentStep = -1;
      appState.cubeState = null;
      resetDiyFaces();
      enterDiyMode();
      $('#solveMoveCount').textContent = '步骤数：--';
      $('#solveStep').innerHTML = '先 DIY 打乱魔方，或完成拍照识别';
      $('#solveList').innerHTML = '';
    });

    // 一键还原按钮
    $('#btnSolveDIY').addEventListener('click', solveFromDiy);

    // 随机打乱按钮
    $('#btnScramble').addEventListener('click', scrambleCube);

    // 速度调节（0.5s ~ 5s 连续滑块）
    const speedSlider = $('#speedSlider');
    const speedValue = $('#speedValue');
    const speedMeta = $('#speedMeta');
    function applySpeed(speedSec) {
      appState.solveSpeed = speedSec * 1000;
      const display = speedSec.toFixed(1);
      speedValue.textContent = `${display} 秒`;
      speedMeta.textContent = `每步 ${display} 秒`;
      // 如果正在播放，重启定时器以应用新速度
      if (appState.autoPlayTimer) {
        clearTimeout(appState.autoPlayTimer);
        appState.autoPlayTimer = null;
        toggleAutoPlay();
      }
    }
    speedSlider.addEventListener('input', () => {
      applySpeed(parseFloat(speedSlider.value));
    });

    // 3D 贴纸点击涂色（通过 ThreeRenderer 回调）
    ThreeRenderer.onStickerClick = (pick) => {
      // 仅在 DIY 模式（无求解结果）且选中了颜色时涂色
      if (appState.solution.length) return;
      if (!appState.selectedColor) return;
      paintSticker(pick);
    };

    // 初始 UI 状态：DIY 模式（无求解结果）
    toggleSolveUi();
  }

  // ===================== 初始化 =====================
  function init() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    initTimer();
    initScanner();
    initSolveControls();

    // 魔方类型切换
    const cubeTypeSelect = $('#cubeTypeSelect');
    if (cubeTypeSelect) {
      cubeTypeSelect.addEventListener('change', () => {
        switchCubeType(cubeTypeSelect.value);
      });
    }

    window.addEventListener('resize', () => {
      if (appState.currentTab === 'solve') ThreeRenderer.resize();
    });
  }

  // 切换魔方类型：重置扫描/求解/DIY 状态，重新渲染
  function switchCubeType(typeId) {
    if (typeId === appState.cubeType) return;
    appState.cubeType = typeId;
    // 重置状态
    appState.scanFaces = {};
    appState.scanCells = {};
    appState.scanAutoFaces = {};
    appState.scanIndex = 0;
    appState.selectedCell = null;
    appState.solution = [];
    appState.currentStep = -1;
    appState.cubeState = null;
    appState.bigCubeState = null;
    appState.scrambleMoves = null;
    appState.scrambleFaces = null;
    appState.solveSource = '';
    appState.diyFaces = {};
    appState.selectedColor = null;

    // 刷新扫描面板网格（2×2 / 3×3）
    refreshScanGrid();

    // 若当前在 3D 教学页，重新进入 DIY 模式
    if (appState.currentTab === 'solve') {
      enterDiyMode(true);
    }
  }

  // 刷新扫描面板网格显示（切换魔方类型后网格大小变化）
  function refreshScanGrid() {
    const grid3x3 = $('#grid3x3');
    if (!grid3x3) return;
    const gridSize = getGridSize();
    const grid = appState.scanFaces[appState.scanOrder[appState.scanIndex]] || Array(getStickerCount()).fill(null);
    grid3x3.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
    grid3x3.innerHTML = grid.map((color, i) => {
      const css = color ? (Scanner.COLOR_DEFS.find(c => c.name === color)?.css || '#333') : '#333';
      const cls = 'cell' + (appState.selectedCell === i ? ' selected' : '');
      return `<button type="button" class="${cls}" data-index="${i}" style="background:${css}" aria-pressed="${appState.selectedCell === i}" aria-label="第${i + 1}格：${color ? (COLOR_KEY_NAME[color] || color) : '未识别'}">${color ? '' : '?'}</button>`;
    }).join('');
    grid3x3.querySelectorAll('.cell').forEach(cell => {
      cell.addEventListener('click', () => {
        appState.selectedCell = parseInt(cell.dataset.index);
        refreshScanGrid();
        grid3x3.querySelector(`[data-index="${appState.selectedCell}"]`)?.focus();
      });
    });
    const btnSolve = $('#btnSolve');
    if (btnSolve) btnSolve.disabled = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露调试/测试接口
  window.__cubeApp = {
    FACE_STICKER_POS,
    ThreeRenderer,
    appState,
    // 调试辅助
    stickerIndexOf,
    solveFromDiy,
    resetDiyFaces,
    enterDiyMode,
    paintSticker,
  };
})();
