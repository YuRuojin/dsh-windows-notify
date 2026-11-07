
import { apply, Config } from '../index.js'

const listeners = new Map()
const logs = []
const ctx = {
  logger: {
    info: (...args) => logs.push(['info', ...args]),
    warn: (...args) => logs.push(['warn', ...args]),
  },
  on(name, fn) { listeners.set(name, fn) },
  get() { return undefined },
}
const config = Config({})
config.minDurationMs = { get: () => 0 }
apply(ctx, config)
const session = { id: 'e2e', header: { cwd: 'E:\\workspace\\dsh' } }
const emit = (event) => listeners.get('session/event')(session, event)
emit({ type: 'turn/start', time: Date.now() - 12_000, data: { turn: 1 } })
emit({ type: 'user/message', time: Date.now() - 11_500, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '端到端测试：插件事件路径' }] } })
emit({ type: 'session/title', time: Date.now() - 10_000, data: { title: '插件端到端测试' } })
emit({ type: 'assistant/message', time: Date.now() - 5_000, data: { message: { content: [{ type: 'text', text: '端到端测试已完成，通知布局和点击行为正常。' }] } } })
emit({ type: 'turn/end', time: Date.now(), data: { turn: 1, reason: { kind: 'completed' } } })
await new Promise(resolve => setTimeout(resolve, 3000))
console.log(JSON.stringify(logs))
