/* solver-worker.js — 后台求解 Worker
 * 4×4 降阶法（中心配对 + 棱块配对 + 3×3 阶段）耗时数秒到数十秒，
 * 放在 Worker 中执行，避免冻结主线程 UI；阶段进度通过 postMessage 实时回传。
 */
self.window = self;                       // solver.js / bigcube.js 依赖 window 全局
self.FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B']; // cube.js 中定义的全局

importScripts('./bigcube.js', './solver.js');

// vendor/cube-solver.js 是 ES module，classic worker 中用动态 import 加载
const vendorReady = import('./vendor/cube-solver.js').then((m) => {
  self.cubeSolverModule = m;
});

self.onmessage = async (event) => {
  const { id, faces, cubeType } = event.data || {};
  try {
    await vendorReady;
    let solution;
    if (cubeType === '444') {
      solution = self.Solver.solve4x4(faces, (cur, total, label) => {
        self.postMessage({ id, type: 'progress', cur, total, label });
      });
    } else if (cubeType === '222') {
      solution = self.Solver.solve2x2(faces);
    } else {
      solution = self.Solver.solve(faces);
    }
    self.postMessage({ id, type: 'done', solution });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: (err && err.message) || String(err) });
  }
};
