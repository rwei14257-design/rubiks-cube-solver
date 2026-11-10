/**
 * scanner.js — 魔方颜色识别
 * 支持摄像头实时取景 + 上传照片，检测 3x3 网格并识别颜色
 * 采用 HSV 颜色空间 + 网格采样，可手动修正
 */

const Scanner = (() => {
  let video = null;
  let overlayCanvas = null;
  let stream = null;
  let cameraOn = false;

  // 颜色定义（HSV 阈值）
  // 6 种魔方标准颜色
  const COLOR_DEFS = [
    { name: 'white', label: '白', css: '#ffffff', hsv: [[0, 0, 180], [180, 40, 255]] },
    { name: 'yellow', label: '黄', css: '#ffd500', hsv: [[15, 60, 120], [45, 255, 255]] },
    { name: 'red', label: '红', css: '#d0342c', hsv: [[0, 80, 80], [12, 255, 255]] },
    { name: 'orange', label: '橙', css: '#ff7b00', hsv: [[8, 80, 80], [25, 255, 255]] },
    { name: 'green', label: '绿', css: '#00a94f', hsv: [[50, 60, 60], [90, 255, 255]] },
    { name: 'blue', label: '蓝', css: '#1a6dff', hsv: [[95, 80, 60], [140, 255, 255]] },
  ];

  // 红色需要特殊处理（HSV 中红色跨越 0°）
  const COLOR_KEYS = ['white', 'yellow', 'red', 'orange', 'green', 'blue'];

  // 各标准色在 HSV 空间中的参考中心（用于距离聚类）
  // 白色/黑色特殊：用亮度 + 饱和度判断，不进 HSV 距离
  const COLOR_REF_HSV = {
    red:    { h: 0,   s: 200, v: 200 },
    orange: { h: 25,  s: 220, v: 220 },
    yellow: { h: 50,  s: 220, v: 220 },
    green:  { h: 120, s: 180, v: 170 },
    blue:   { h: 210, s: 200, v: 200 },
  };

  function init(videoEl, overlayEl) {
    video = videoEl;
    overlayCanvas = overlayEl;
  }

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      cameraOn = true;
      return true;
    } catch (err) {
      console.error('摄像头开启失败', err);
      return false;
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    cameraOn = false;
    if (video) video.srcObject = null;
  }

  function isCameraOn() { return cameraOn; }

  /**
   * 从视频或图片中识别 3x3 颜色网格
   * 改进：缩小采样区域、自适应检测魔方边界、逐格中位数采样
   * @param {HTMLVideoElement|HTMLImageElement} source
   * @param {HTMLCanvasElement} canvas 用于绘制识别结果的画布
   * @returns {{colors: Array<string>, bounds: Object|null, cells: Array}} 识别结果
   */
  function detectGrid(source, canvas, gridSize = 3) {
    const w = source.videoWidth || source.naturalWidth || source.width;
    const h = source.videoHeight || source.naturalHeight || source.height;
    if (!w || !h) return null;

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);

    // 自适应检测魔方边界：找到"非背景"区域的包围盒
    const bounds = detectCubeBounds(ctx, w, h);
    let marginX, marginY, cellW, cellH;

    if (bounds) {
      // 使用检测到的魔方区域（略微内缩，避开边框）
      const inset = Math.min(bounds.w, bounds.h) * 0.04;
      marginX = bounds.x + inset;
      marginY = bounds.y + inset;
      cellW = (bounds.w - inset * 2) / gridSize;
      cellH = (bounds.h - inset * 2) / gridSize;
    } else {
      // 兜底：使用固定边距
      marginX = w * 0.08;
      marginY = h * 0.08;
      cellW = (w - marginX * 2) / gridSize;
      cellH = (h - marginY * 2) / gridSize;
    }

    const colors = [];
    const cells = [];
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        // 每格中心区域采样（缩小到 30%，减少边框/阴影干扰）
        const cx = marginX + cellW * (col + 0.5);
        const cy = marginY + cellH * (row + 0.5);
        const sampleSize = Math.min(cellW, cellH) * 0.30;
        // sampleCellRaw 返回 { rgb, hsv }，同时给出快速分类
        const raw = sampleCellRaw(ctx, cx, cy, sampleSize);
        const color = classifyColor(raw.hsv[0], raw.hsv[1], raw.hsv[2], raw.rgb[0], raw.rgb[1], raw.rgb[2]);
        colors.push(color);
        cells.push({ cx, cy, color, hsv: raw.hsv, rgb: raw.rgb });
      }
    }
    return { colors, bounds, cells, w, h };
  }

  /**
   * 在画布上绘制识别网格覆盖层（可视化反馈）
   * @param {HTMLCanvasElement} canvas 目标画布
   * @param {Object} result detectGrid 的返回结果
   */
  function drawGridOverlay(canvas, result) {
    if (!result || !result.cells) return;
    const ctx = canvas.getContext('2d');
    const { cells, bounds, w, h } = result;
    const cellW = w / 3;
    const cellH = h / 3;
    const r = Math.min(cellW, cellH) * 0.15;

    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = Math.max(2, w * 0.004);
    ctx.font = `bold ${Math.max(12, w * 0.035)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    cells.forEach(c => {
      const colorKey = c.color;
      const isBlack = colorKey === 'black' || colorKey === null;
      // 描边色：未识别用红色警示，已识别用白色
      ctx.strokeStyle = isBlack ? 'rgba(255,59,48,0.9)' : 'rgba(255,255,255,0.9)';
      ctx.fillStyle = isBlack ? 'rgba(255,59,48,0.15)' : 'rgba(0,0,0,0.25)';
      const cx = c.cx, cy = c.cy;
      const halfW = cellW * 0.45, halfH = cellH * 0.45;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2, r);
      } else {
        ctx.rect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);
      }
      ctx.fill();
      ctx.stroke();
      // 显示颜色名
      const def = COLOR_DEFS.find(d => d.name === colorKey);
      const label = def ? def.label : '?';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 4;
      ctx.fillText(label, cx, cy);
      ctx.shadowBlur = 0;
    });

    // 绘制魔方边界框
    if (bounds) {
      ctx.strokeStyle = 'rgba(10,132,255,0.9)';
      ctx.lineWidth = Math.max(2, w * 0.006);
      ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    }
  }

  /**
   * 检测魔方在画面中的边界（包围盒）
   * 通过扫描边缘，找到颜色块聚集区域
   */
  function detectCubeBounds(ctx, w, h) {
    // 降采样扫描，找非背景像素的包围盒
    const step = 6;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // 判断是否"有色"（不是纯黑/极暗背景）
        const brightness = (r + g + b) / 3;
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
        if (brightness > 40 && saturation > 15) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const bw = maxX - minX;
    const bh = maxY - minY;
    // 包围盒需要足够大且接近正方形（魔方是方的）
    if (bw < w * 0.3 || bh < h * 0.3) return null;
    if (bw < bh * 0.5 || bw > bh * 2) return null; // 明显非方形

    return { x: minX, y: minY, w: bw, h: bh };
  }

  /**
   * 采样一格的中心区域，返回原始 RGB + HSV（不做分类）
   * 使用中位数采样（而非平均），减少高光/阴影干扰
   * @returns {{rgb: Array<number>, hsv: Array<number>}}
   */
  function sampleCellRaw(ctx, cx, cy, size) {
    const half = size / 2;
    const x = Math.max(0, Math.floor(cx - half));
    const y = Math.max(0, Math.floor(cy - half));
    const s = Math.floor(size);
    const data = ctx.getImageData(x, y, s, s).data;

    // 收集所有像素的 RGB
    const samples = [];
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      samples.push([r, g, b]);
    }

    // 用中位数（去掉最亮和最暗的极端像素）
    if (samples.length > 20) {
      // 按亮度排序，去掉两端 20% 的极端值
      samples.sort((a, b) => ((a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2])));
      const trim = Math.floor(samples.length * 0.2);
      samples.splice(0, trim);
      samples.splice(samples.length - trim, trim);
    }

    let r = 0, g = 0, b = 0;
    for (const [rr, gg, bb] of samples) {
      r += rr; g += gg; b += bb;
    }
    const n = samples.length || 1;
    r /= n; g /= n; b /= n;

    const [h, s_, v] = rgbToHsv(r, g, b);
    return { rgb: [r, g, b], hsv: [h, s_, v] };
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, s * 255, v * 255];
  }

  // 颜色分类（改进版：更精细的红橙区分）
  function classifyColor(h, s, v, r, g, b) {
    // 白色：高亮度、低饱和
    if (v > 180 && s < 50) return 'white';

    // 灰色/黑色（未识别区域）
    if (v < 50) return 'black';

    // 红色与橙色区分（关键难点）：
    // 红色 hue 接近 0（或 360），橙色 hue 约 15-40
    // 红橙都需要较高饱和度，但红色更"纯"（饱和度更高、绿色分量更低）
    if (s > 60 && v > 70) {
      // 红色：hue 0-12 或 345-360，且绿色分量明显低于红色
      if (h < 12 || h > 345) {
        // 进一步用 RGB 确认：红色是 r 远大于 g
        if (r > 120 && (r - g) > 60) return 'red';
      }
      // 橙色：hue 12-45
      if (h >= 12 && h < 45) {
        // 橙色 g 分量比红色更高
        if (r > 100 && g > 40) return 'orange';
      }
    }

    // 黄色：hue 45-75，高饱和
    if (h >= 45 && h < 75 && s > 60) return 'yellow';

    // 绿色：hue 75-160
    if (h >= 75 && h < 160 && s > 40) return 'green';

    // 蓝色：hue 160-260
    if (h >= 160 && h < 260 && s > 40) return 'blue';

    // 兜底：基于 RGB 的相对比较
    if (r > g && r > b) {
      if (g > 120) return 'yellow';
      if (g > 70) return 'orange';
      return 'red';
    }
    if (g > r && g > b) return 'green';
    if (b > r && b > g) return 'blue';
    if (r > 180 && g > 180 && b > 180) return 'white';

    return 'black';
  }

  /**
   * 计算两个 HSV 之间的感知距离（用于聚类）
   * 色相是环形的，需要取最短弧距离
   */
  function hsvDistance(a, b) {
    let dh = Math.abs(a[0] - b[0]);
    dh = Math.min(dh, 360 - dh);          // 环形色相距离
    const ds = a[1] - b[1];
    const dv = a[2] - b[2];
    // 色相权重最高，饱和度和亮度次之
    return Math.sqrt(dh * dh + (ds * 0.6) * (ds * 0.6) + (dv * 0.6) * (dv * 0.6));
  }

  /**
   * 核心改进 1：中心块锚定分类（qbr 的核心理念）
   * 用每一面的中心块颜色作为"锚点"，把 9 格分类变成"离哪个中心色最近"。
   * 这样能天然适应当前光照（所有格子在同一光照下采集），
   * 无需硬编码阈值，抗光照变化能力大幅提升。
   *
   * 关键洞察：魔方每个面的 9 个 sticker 中，中心块颜色 = 该面的主色。
   * 由于同一面在同一张照片里、同一光照下，用"相对距离"判断
   * 比"绝对 HSV 阈值"稳健得多。
   *
   * @param {Array} cells - detectGrid 返回的 cells（含 hsv/rgb）
   * @returns {Array<string>} 9 个颜色 key（已用中心锚定 + 全局约束纠正）
   */
  function classifyFaceConstrained(cells) {
    if (!cells || cells.length !== 9) return null;

    // 中心块索引 4
    const center = cells[4];
    const centerColor = classifyColor(center.hsv[0], center.hsv[1], center.hsv[2], center.rgb[0], center.rgb[1], center.rgb[2]);

    // 如果中心块是黑/灰（没识别到），退回逐格分类
    if (centerColor === 'black' || centerColor === 'white' && center.hsv[1] > 50) {
      return cells.map(c => classifyColor(c.hsv[0], c.hsv[1], c.hsv[2], c.rgb[0], c.rgb[1], c.rgb[2]));
    }

    // 用中心块 HSV 作为该面主色的参考，逐个格子算"离中心多远"
    // 白色是特殊情况：中心块若是白，其余格也应是高亮（即使带轻微色偏）
    const isWhiteCenter = centerColor === 'white';

    return cells.map(c => {
      if (isWhiteCenter) {
        // 白面：中心是白，其余 8 格在同光照下也应是"高亮"。
        // 用相对判断：亮度接近中心块（而非绝对阈值），
        // 这样即使整面偏黄/偏蓝，也能正确判为白。
        const dv = Math.abs(c.hsv[2] - center.hsv[2]);
        // 亮度与中心接近（差 < 60）→ 白；明显更暗/更饱和 → 非白
        if (dv < 60) return 'white';
        return classifyColor(c.hsv[0], c.hsv[1], c.hsv[2], c.rgb[0], c.rgb[1], c.rgb[2]);
      }
      // 非白面：中心块颜色是"标准"，其余格应该也是接近这个颜色
      // 用中心块 HSV 与参考色的距离来"归一化"——如果中心块本身偏色，
      // 说明光照有偏移，用相对判断
      return classifyRelativeToCenter(c, center);
    });
  }

  /**
   * 核心改进 2：相对中心分类
   * 计算该格与中心块（同面主色）的 HSV 距离，若距离小则判定为主色；
   * 否则用全局参考色判断属于哪个颜色。
   */
  function classifyRelativeToCenter(cell, center) {
    const dCenter = hsvDistance(cell.hsv, center.hsv);
    // 若与中心块颜色非常接近（同一颜色），直接判定为中心块颜色
    const centerColor = classifyColor(center.hsv[0], center.hsv[1], center.hsv[2], center.rgb[0], center.rgb[1], center.rgb[2]);

    // 阈值：色相接近 + 饱和接近 = 同色
    let dh = Math.abs(cell.hsv[0] - center.hsv[0]);
    dh = Math.min(dh, 360 - dh);
    const ds = Math.abs(cell.hsv[1] - center.hsv[1]);
    const dv = Math.abs(cell.hsv[2] - center.hsv[2]);

    // 同面主色：色相差小（<30°）、饱和度差不太大
    if (dh < 30 && ds < 120) {
      return centerColor;
    }
    // 否则用全局分类兜底
    return classifyColor(cell.hsv[0], cell.hsv[1], cell.hsv[2], cell.rgb[0], cell.rgb[1], cell.rgb[2]);
  }

  /**
   * 核心改进 3：全局 9 色平衡分配（Cube_Solver 的核心理念，加入面归属先验）
   * 魔方每种颜色恰好出现 9 次。但"红橙"等颜色在 HSV 上太接近，
   * 纯距离聚类会把它们对调。因此这里的关键是：
   *
   *   1. 中心块锚定 = 强先验：每面中心块颜色确定，该面主色确定。
   *   2. 每个格子先"面内锁定"：离中心块近 → 判为该面主色（不参与洗牌）。
   *   3. 只有"离中心块明显远"的格子才进入全局平衡，用容量约束分配。
   *
   * 这样既利用了"每色恰好 9 个"的全局约束纠错，
   * 又不会破坏中心锚定在面内已经做对的判断（尤其是红橙）。
   *
   * @param {Object} faceCells - { U: [9 cells], R: [...], ... } 每个 cell 含 hsv
   * @returns {Object|null} 纠正后的 { U: [9 colorKeys], ... }，若数据不足返回 null
   */
  function balanceGlobalColors(faceCells) {
    const faces = ['U', 'R', 'F', 'D', 'L', 'B'];
    if (!faces.every(f => faceCells[f] && faceCells[f].length === 9)) return null;

    const COLOR_ORDER = ['white', 'yellow', 'red', 'orange', 'green', 'blue'];

    // 1. 确定每面的主色（中心块索引 4）
    const faceMainColor = {};
    const faceCenter = {};
    faces.forEach(f => {
      const c = faceCells[f][4];
      faceCenter[f] = c;
      faceMainColor[f] = classifyColor(c.hsv[0], c.hsv[1], c.hsv[2], c.rgb[0], c.rgb[1], c.rgb[2]);
    });

    // 2. 逐格判断：离中心块近 → 锁定主色；远 → 待平衡
    const result = {};
    const pending = [];  // 需要全局平衡的格子
    faces.forEach(f => {
      result[f] = new Array(9).fill(null);
      const center = faceCenter[f];
      const main = faceMainColor[f];
      faceCells[f].forEach((cell, idx) => {
        if (idx === 4) { result[f][idx] = main; return; } // 中心块固定
        // 白色主色：用亮度差判断；非白：用色相/饱和度差判断
        let locked = false;
        if (main === 'white') {
          locked = Math.abs(cell.hsv[2] - center.hsv[2]) < 60;
        } else {
          let dh = Math.abs(cell.hsv[0] - center.hsv[0]);
          dh = Math.min(dh, 360 - dh);
          const ds = Math.abs(cell.hsv[1] - center.hsv[1]);
          locked = dh < 30 && ds < 120;
        }
        if (locked) {
          result[f][idx] = main;
        } else {
          pending.push({ face: f, idx, hsv: cell.hsv, rgb: cell.rgb });
        }
      });
    });

    // 3. 对"待平衡"格子做容量感知分配
    // 先统计已锁定的颜色数量，剩下的容量分配给 pending
    const used = {};
    COLOR_ORDER.forEach(k => used[k] = 0);
    faces.forEach(f => result[f].forEach(c => { if (c) used[c]++; }));

    const capacity = {};
    COLOR_ORDER.forEach(k => capacity[k] = 9 - used[k]);

    // 白色判定
    function isWhite(hsv) { return hsv[2] > 180 && hsv[1] < 50; }

    // 为每个 pending 格子算到各色的代价
    const candidates = [];
    pending.forEach((item, i) => {
      COLOR_ORDER.forEach(k => {
        let cost;
        if (k === 'white') {
          cost = isWhite(item.hsv) ? 0 : 1000;
        } else if (isWhite(item.hsv)) {
          cost = 1000; // 明显的白，不会分给彩色
        } else {
          cost = hsvDistance(item.hsv, COLOR_REF_HSV[k]);
        }
        candidates.push({ i, k, c: cost });
      });
    });
    candidates.sort((a, b) => a.c - b.c);

    const assigned = pending.map(() => null);
    for (const cand of candidates) {
      if (assigned[cand.i] !== null) continue;
      if (capacity[cand.k] <= 0) continue;
      assigned[cand.i] = cand.k;
      capacity[cand.k]--;
    }

    // 回填
    pending.forEach((item, i) => {
      result[item.face][item.idx] = assigned[i] ||
        classifyColor(item.hsv[0], item.hsv[1], item.hsv[2], item.rgb[0], item.rgb[1], item.rgb[2]);
    });

    return result;
  }

  return {
    init,
    startCamera,
    stopCamera,
    isCameraOn,
    detectGrid,
    drawGridOverlay,
    classifyFaceConstrained,
    balanceGlobalColors,
    COLOR_DEFS,
    COLOR_KEYS,
    classifyColor,
  };
})();

if (typeof window !== 'undefined') {
  window.Scanner = Scanner;
}
