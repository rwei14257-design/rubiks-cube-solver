/**
 * timer.js — 魔方还原计时器
 * 支持开始/停止/复位，成绩本地存储（localStorage）
 */

const Timer = (() => {
  let isRunning = false;
  let startTime = 0;
  let elapsed = 0;
  let rafId = null;

  const STORAGE_KEY = 'cube_solve_history';

  // 获取历史记录
  function getHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  // 保存历史记录
  function saveHistory(history) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  // 添加一条成绩
  function addRecord(timeMs) {
    const history = getHistory();
    history.unshift({
      time: timeMs,
      date: new Date().toISOString(),
    });
    // 最多保留 200 条
    if (history.length > 200) history.length = 200;
    saveHistory(history);
    return history;
  }

  // 删除一条记录
  function deleteRecord(index) {
    const history = getHistory();
    history.splice(index, 1);
    saveHistory(history);
    return history;
  }

  // 清空历史
  function clearHistory() {
    saveHistory([]);
    return [];
  }

  // 格式化时间显示
  function formatTime(ms) {
    if (ms == null || isNaN(ms)) return '--';
    const seconds = ms / 1000;
    if (seconds < 60) {
      return seconds.toFixed(2) + 's';
    }
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }

  // 计算统计数据
  function getStats(history) {
    const times = history.map(h => h.time);
    const best = times.length ? Math.min(...times) : null;
    const count = times.length;
    const recent = times.slice(0, 5);
    const avg = recent.length
      ? recent.reduce((a, b) => a + b, 0) / recent.length
      : null;
    return { best, avg, count };
  }

  return {
    isRunning: () => isRunning,
    start() { isRunning = true; startTime = performance.now(); },
    stop() {
      isRunning = false;
      elapsed = performance.now() - startTime;
      return elapsed;
    },
    reset() { isRunning = false; elapsed = 0; startTime = 0; },
    getHistory,
    saveHistory,
    addRecord,
    deleteRecord,
    clearHistory,
    formatTime,
    getStats,
    STORAGE_KEY,
  };
})();

if (typeof window !== 'undefined') {
  window.Timer = Timer;
}
