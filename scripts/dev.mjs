// 启动 Vite 开发服务器，再以该地址启动 Electron。
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electron from 'electron';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
// VS Code 等基于 Electron 的终端会设置 ELECTRON_RUN_AS_NODE，使 Electron 以纯 Node 方式运行。
const env = { ...process.env, VITE_DEV_SERVER_URL: url };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
