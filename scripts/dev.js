const { spawn } = require('child_process')
const path = require('path')

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const useShell = process.platform === 'win32'
let shuttingDown = false

const commands = [
  { name: 'server', cwd: 'server' },
  { name: 'client', cwd: 'client' }
]

const children = commands.map(({ name, cwd }) => {
  const child = spawn(npm, ['run', 'dev'], {
    cwd: path.resolve(__dirname, '..', cwd),
    stdio: 'inherit',
    shell: useShell
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) return

    shuttingDown = true
    stopChildren()

    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    process.exit(code || 0)
  })

  child.on('error', error => {
    console.error(`[dev:${name}] ${error.message}`)
    if (!shuttingDown) {
      shuttingDown = true
      stopChildren()
      process.exit(1)
    }
  })

  return child
})

function stopChildren() {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

process.on('SIGINT', () => {
  shuttingDown = true
  stopChildren()
  process.exit(130)
})

process.on('SIGTERM', () => {
  shuttingDown = true
  stopChildren()
  process.exit(143)
})
