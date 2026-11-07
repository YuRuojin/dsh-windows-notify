
import assert from 'node:assert/strict'
import { apply, Config, normalizeConfig } from '../index.js'

// Schema defaults are what a fresh cordis row receives.
const defaults = Config({})
console.log('defaults are volatile refs:', Object.keys(defaults).length)
// Every schema field is volatile, so a fresh row arrives as refs; read the
// resolved defaults through them.
const resolved = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, value.get()]))
assert.equal(resolved.enabled, true)
assert.equal(resolved.minDurationMs, 8000)
assert.equal(resolved.appId, 'com.deepseek.dsh')
assert.equal(resolved.language, 'auto')
assert.equal(resolved.clickUrl, 'dsh://open')

// normalizeConfig must read volatile refs.
const normalized = normalizeConfig(defaults)
assert.equal(normalized.enabled, true)
assert.equal(normalized.minDurationMs, 8000)
assert.equal(normalized.language, 'auto')
assert.equal(normalized.clickUrl, 'dsh://open')
assert.equal(normalized.appId, 'com.deepseek.dsh')
assert.equal(normalizeConfig({ appId: { get: () => 'DeepSeekHarness.Notify' } }).appId, 'com.deepseek.dsh')
assert.equal(normalizeConfig({ clickUrl: { get: () => '' } }).clickUrl, 'dsh://open')
assert.equal(normalizeConfig({ clickUrl: { get: () => 'dsh://open' } }).clickUrl, 'dsh://open')
assert.equal(normalizeConfig({ clickUrl: { get: () => 'http://127.0.0.1:2872' } }).clickUrl, 'http://127.0.0.1:2872')
assert.equal(normalizeConfig({ clickUrl: { get: () => 'javascript:alert(1)' } }).clickUrl, 'dsh://open')

// Registration smoke: apply must install both listeners and plan nothing for a
// short turn when the minimum is high.
const listeners = new Map()
const logs = []
const ctx = {
  logger: { info: (...args) => logs.push(['info', ...args]), warn: (...args) => logs.push(['warn', ...args]) },
  on(name, fn) { listeners.set(name, fn) },
  get() { return undefined },
}
apply(ctx, { ...defaults, minDurationMs: { get: () => 999999 } })
assert.ok(listeners.has('session/event'))
assert.ok(listeners.has('session/disposed'))
const session = { id: 'smoke', header: { cwd: 'E:\\work\\demo' }, title: 'x' }
listeners.get('session/event')(session, { type: 'turn/start', time: 1000, data: { turn: 1 } })
listeners.get('session/event')(session, { type: 'user/message', time: 1100, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] } })
listeners.get('session/event')(session, { type: 'turn/end', time: 2000, data: { turn: 1, reason: { kind: 'completed' } } })
listeners.get('session/disposed')(session)
console.log('logs', logs)
assert.equal(logs.length, 0)
console.log('integration smoke ok')
