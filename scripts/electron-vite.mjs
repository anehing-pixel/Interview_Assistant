/**
 * electron-vite 启动器。
 *
 * 为什么需要它：如果父进程（VS Code 集成终端、各类 Electron 宿主应用的终端面板、
 * CI 容器等）导出了 ELECTRON_RUN_AS_NODE=1，electron.exe 会退化成纯 Node 运行，
 * 主进程里的 `import { app, BrowserWindow } from 'electron'` 就会抛
 * "The requested module 'electron' does not provide an export named 'BrowserWindow'"。
 * 这里在拉起子进程前清掉该变量，让 `npm run dev` 在任何 shell 下都能真正启动 Electron。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const command = process.argv[2] ?? 'dev'
const passthrough = process.argv.slice(3)

const bin = join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
if (!existsSync(bin)) {
  console.error('[electron-vite] 找不到 electron-vite，请先运行 npm install')
  process.exit(1)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_NO_ATTACH_CONSOLE

// npm 会把真实的 node 路径放在 npm_node_execpath，避免在 Electron 宿主里
// process.execPath 指向 electron.exe 而再次走错运行时。
const nodeBin = process.env.npm_node_execpath || 'node'

const child = spawn(nodeBin, [bin, command, ...passthrough], {
  cwd: root,
  env,
  stdio: 'inherit'
})

child.on('error', (error) => {
  console.error('[electron-vite] 启动失败：', error.message)
  process.exit(1)
})

const forward = (signal) => {
  if (!child.killed) child.kill(signal)
}
process.on('SIGINT', () => forward('SIGINT'))
process.on('SIGTERM', () => forward('SIGTERM'))

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(0)
    return
  }
  process.exit(code ?? 0)
})
