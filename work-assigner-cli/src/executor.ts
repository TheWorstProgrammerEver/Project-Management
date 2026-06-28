import { spawn } from 'node:child_process'
import type { ExecuteTaskInput, ExecuteTaskResult, TaskExecutor } from './types.js'

const keepTail = (value: string, maxLength: number) => (
  value.length <= maxLength ? value : value.slice(value.length - maxLength)
)

export class ShellTaskExecutor implements TaskExecutor {
  private readonly command: string
  private readonly cwd: string

  constructor(command: string, cwd = process.cwd()) {
    this.command = command
    this.cwd = cwd
  }

  async run(input: ExecuteTaskInput): Promise<ExecuteTaskResult> {
    return await new Promise((resolve, reject) => {
      const child = spawn(this.command, {
        cwd: this.cwd,
        env: {
          ...process.env,
          ...input.environment
        },
        shell: true,
        stdio: ['pipe', 'pipe', 'inherit']
      })
      let stdoutTail = ''

      if (child.pid) {
        void input.onChildPid(child.pid).catch(reject)
      }

      const abort = () => {
        child.kill('SIGTERM')
      }

      input.signal.addEventListener('abort', abort, { once: true })

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        process.stdout.write(text)
        stdoutTail = keepTail(stdoutTail + text, 60_000)
      })

      child.on('error', (error) => {
        input.signal.removeEventListener('abort', abort)
        reject(error)
      })

      child.on('close', (code, signal) => {
        input.signal.removeEventListener('abort', abort)
        resolve({
          exitCode: code ?? 1,
          signal: signal ?? undefined,
          stdoutTail: stdoutTail.trim()
        })
      })

      child.stdin?.end(input.prompt)
    })
  }
}
