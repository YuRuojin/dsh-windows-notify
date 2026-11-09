
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { apply, Config, normalizeConfig, resolveImagePath } from '../index.js'

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
assert.equal(resolved.sound, true)
assert.equal(resolved.soundKind, 'default')
assert.equal(resolved.notifyOnAborted, false)
assert.equal(resolved.iconPath, '')
assert.equal(resolved.imagePath, '')

// normalizeConfig must read volatile refs.
const normalized = normalizeConfig(defaults)
assert.equal(normalized.enabled, true)
assert.equal(normalized.minDurationMs, 8000)
assert.equal(normalized.language, 'auto')
assert.equal(normalized.clickUrl, 'dsh://open')
assert.equal(normalized.appId, 'com.deepseek.dsh')
assert.equal(normalized.soundKind, 'default')
assert.equal(normalizeConfig({ appId: { get: () => 'DeepSeekHarness.Notify' } }).appId, 'com.deepseek.dsh')
assert.equal(normalizeConfig({ clickUrl: { get: () => '' } }).clickUrl, 'dsh://open')
assert.equal(normalizeConfig({ clickUrl: { get: () => 'dsh://open' } }).clickUrl, 'dsh://open')
assert.equal(normalizeConfig({ clickUrl: { get: () => 'http://127.0.0.1:2872' } }).clickUrl, 'http://127.0.0.1:2872')
assert.equal(normalizeConfig({ clickUrl: { get: () => 'javascript:alert(1)' } }).clickUrl, 'dsh://open')
assert.equal(normalizeConfig({ soundKind: { get: () => 'reminder' } }).soundKind, 'reminder')
assert.equal(normalizeConfig({ soundKind: { get: () => 'alarm' } }).soundKind, 'default')
assert.equal(normalizeConfig({ soundKind: { get: () => 7 } }).soundKind, 'default')
assert.equal(normalizeConfig({ imagePath: { get: () => ' C:\\x.png ' } }).imagePath, 'C:\\x.png')

// resolveImagePath: empty keeps the bundled artwork, none hides it, URLs and
// existing files pass through, missing files fall back.
const bundled = resolveImagePath('')
assert.ok(bundled === '' || /^file:\/\//u.test(bundled))
assert.equal(resolveImagePath('   '), bundled)
assert.equal(resolveImagePath('none'), '')
assert.equal(resolveImagePath('NONE'), '')
assert.equal(resolveImagePath('https://example.com/artwork.png'), 'https://example.com/artwork.png')
assert.equal(resolveImagePath('file:///C:/art.png'), 'file:///C:/art.png')
assert.equal(resolveImagePath('Q:\\definitely\\missing\\art.png'), bundled)
const bundledFile = fileURLToPath(new URL('../assets/celebrate.png', import.meta.url))
if (existsSync(bundledFile)) {
  assert.notEqual(bundled, '')
  assert.match(resolveImagePath(bundledFile), /celebrate\.png$/u)
}

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
