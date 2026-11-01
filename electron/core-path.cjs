'use strict';
const fs = require('node:fs');
const path = require('node:path');

// riden-cored 查找顺序：环境变量 → 安装包资源 → core 子模块（或 RIDEN_CORE_DIR）的构建产物。
function resolveCore(app) {
  const exe = process.platform === 'win32' ? 'riden-cored.exe' : 'riden-cored';
  const candidates = [];
  if (process.env.RIDEN_CORED) candidates.push(process.env.RIDEN_CORED);
  if (app.isPackaged) {
    const base = path.join(process.resourcesPath, 'core');
    candidates.push(path.join(base, 'bin', exe), path.join(base, exe));
  }
  const core = process.env.RIDEN_CORE_DIR || path.resolve(__dirname, '..', 'core');
  const dist = path.join(core, 'dist', process.platform === 'win32' ? 'windows' : 'linux');
  candidates.push(path.join(dist, 'bin', exe), path.join(dist, exe), path.join(core, 'build', exe));
  return candidates.find((p) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

module.exports = { resolveCore };
