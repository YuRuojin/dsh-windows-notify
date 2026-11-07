
import assert from 'node:assert/strict'

let definition
globalThis.window = {
  __ModuleLoader__: {
    load(candidate) { definition = candidate },
  },
}

await import('../client.js')
assert.ok(definition)
assert.equal(definition.id, 'dsh-windows-notify')

const React = { createElement: (...args) => ({ args }) }
const factory = definition.factory((name) => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
})
assert.deepEqual(factory.inject, ['slots', 'locale'])
assert.equal(typeof factory.apply, 'function')

const effects = []
const registrations = []
const dictionaries = []
const ctx = {
  locale: {
    bind: (ns) => {
      assert.equal(ns, 'windowsNotify')
      return (key) => key
    },
    register: (ns, dictionary) => { dictionaries.push([ns, dictionary]); return () => {} },
  },
  slots: {
    inject: (name, contribute) => {
      assert.equal(name, 'plugins.row.config')
      const dispose = contribute()
      return () => { if (typeof dispose === 'function') dispose() }
    },
    register: (registration, component) => {
      registrations.push({ registration, component })
      return () => {}
    },
  },
  effect: (fn, label) => {
    effects.push(label)
    return fn()
  },
}
factory.apply(ctx)
assert.equal(dictionaries.length, 1)
assert.equal(registrations.length, 1)
assert.equal(registrations[0].registration.key, 'dsh-windows-notify#windows-notify')
assert.equal(registrations[0].registration.name, 'plugins.row.config')
assert.equal(typeof registrations[0].component, 'function')
assert.ok(effects.includes('windows-notify: labels'))
console.log('client smoke ok')
