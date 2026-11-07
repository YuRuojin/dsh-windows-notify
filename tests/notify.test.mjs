import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_APP_ID,
  DEFAULT_APP_NAME,
  buildPowerShellScript,
  buildToastXml,
  createNotificationPlanner,
  createToastCommand,
  escapeXml,
  formatDuration,
  normalizeText,
  projectName,
  resolveLanguage,
  sendWindowsToast,
} from '../notify.js'

/** A normalized configuration with every notification enabled. */
function config(overrides = {}) {
  return {
    enabled: true,
    minDurationMs: 0,
    notifyOnCompleted: true,
    notifyOnError: true,
    notifyOnAborted: false,
    notifyOnJobs: true,
    notifyOnSubagents: false,
    showPromptPreview: true,
    sound: true,
    language: 'zh',
    appName: DEFAULT_APP_NAME,
    appId: DEFAULT_APP_ID,
    iconPath: '',
    clickUrl: '',
    ...overrides,
  }
}

/** A top-level Session fixture. */
function session(overrides = {}) {
  return {
    id: 'session-1',
    header: { cwd: 'E:\\work\\demo', ...overrides.header },
    ...overrides,
  }
}

/** Feed one event sequence through the planner and return the last notification. */
function run(planner, sess, events) {
  let last
  for (const event of events) last = planner.observe(sess, event)
  return last
}

/** One assistant message carrying a text answer. */
function assistantMessage(time, text) {
  return { type: 'assistant/message', time, data: { message: { content: [{ type: 'text', text }] } } }
}

/** One completed or failed job payload. */
function jobData(overrides = {}) {
  return {
    jobId: 'bash-1',
    owner: 'session-1',
    kind: 'bash',
    label: 'pnpm test',
    startedAt: 10_000,
    finishedAt: 75_000,
    status: 'completed',
    cause: 'producer',
    producerReported: true,
    detail: 'exit code: 0',
    ...overrides,
  }
}

test('escapeXml escapes markup characters', () => {
  assert.equal(escapeXml('<a href="x&y">\'z\'</a>'), '&lt;a href=&quot;x&amp;y&quot;&gt;&apos;z&apos;&lt;/a&gt;')
})

test('normalizeText collapses control characters and truncates', () => {
  assert.equal(normalizeText('  a\n\tb  ', 80), 'a b')
  assert.equal(normalizeText('abcdef', 4), 'abc…')
  assert.equal(normalizeText(undefined, 10), '')
})

test('formatDuration renders compact Chinese and English labels', () => {
  assert.equal(formatDuration(0, 'zh'), '0 秒')
  assert.equal(formatDuration(400, 'zh'), '1 秒')
  assert.equal(formatDuration(12_400, 'zh'), '12 秒')
  assert.equal(formatDuration(65_000, 'zh'), '1 分 5 秒')
  assert.equal(formatDuration(3_600_000, 'zh'), '1 小时')
  assert.equal(formatDuration(12_400, 'en'), '12s')
  assert.equal(formatDuration(65_000, 'en'), '1m 5s')
  assert.equal(formatDuration(3_600_000, 'en'), '1h')
})

test('resolveLanguage honors an explicit preference', () => {
  assert.equal(resolveLanguage('zh'), 'zh')
  assert.equal(resolveLanguage('en'), 'en')
  assert.ok(['zh', 'en'].includes(resolveLanguage('auto')))
})

test('projectName reads the last cwd segment', () => {
  assert.equal(projectName({ header: { cwd: 'E:\\work\\demo\\' } }, 'fallback'), 'demo')
  assert.equal(projectName({ header: { cwd: '/home/me/project' } }, 'fallback'), 'project')
  assert.equal(projectName({}, 'fallback'), 'fallback')
})

test('buildToastXml emits ToastGeneric lines, silence, and protocol activation', () => {
  const xml = buildToastXml({
    title: '登录修复',
    body: '<修复> & 验证',
    footer: '任务完成 · demo · 12 秒',
    silent: true,
    clickUrl: 'dsh://open',
  })
  assert.match(xml, /^<toast activationType="protocol" launch="dsh:\/\/open">/)
  assert.match(xml, /<text>登录修复<\/text>/)
  assert.match(xml, /<text>&lt;修复&gt; &amp; 验证<\/text>/)
  assert.match(xml, /<audio silent="true" \/>/)
  assert.match(xml, /<\/toast>$/)
})

test('buildToastXml omits activation and silence by default', () => {
  const xml = buildToastXml({ title: 'done' })
  assert.equal(xml, '<toast><visual branding="none"><binding template="ToastGeneric" branding="none"><text>done</text></binding></visual></toast>')
})

test('buildToastXml places the 1:1 artwork below the text', () => {
  const xml = buildToastXml({
    title: '登录修复',
    body: '已修复 token 刷新逻辑，并补充了回归测试。',
    footer: '任务完成 · dsh · 12 秒 · 点击打开 Harness',
    image: 'file:///C:/celebrate.png',
  })
  assert.match(xml, /<visual branding="none"><binding template="ToastGeneric" branding="none">/u)
  assert.match(xml, /<text hint-style="base">登录修复<\/text><text hint-style="baseSubtle">已修复 token 刷新逻辑，并补充了回归测试。<\/text><text hint-style="captionSubtle">任务完成 · dsh · 12 秒 · 点击打开 Harness<\/text><image src="file:\/\/\/C:\/celebrate\.png" \/>/u)
  assert.ok(!xml.includes('<group>'))
  assert.ok(!xml.includes('appLogoOverride'))
})

test('buildToastXml can carry an app logo without a content image', () => {
  const xml = buildToastXml({ title: 'done', appLogo: 'file:///C:/icon.png' })
  assert.equal(xml, '<toast><visual branding="none"><binding template="ToastGeneric" branding="none"><image placement="appLogoOverride" src="file:///C:/icon.png" /><text>done</text></binding></visual></toast>')
})

test('buildPowerShellScript carries the payload as Base64 UTF-8 JSON', () => {
  const xml = '<toast><visual><binding template="ToastGeneric"><text>你好</text></binding></visual></toast>'
  const script = buildPowerShellScript({ appId: 'My.App', appName: '我的应用', iconPath: 'C:\\icon.png', xml })
  const encoded = script.match(/FromBase64String\('([^']+)'\)/u)
  assert.ok(encoded)
  const payload = JSON.parse(Buffer.from(encoded[1], 'base64').toString('utf8'))
  assert.deepEqual(payload, { appId: 'My.App', appName: '我的应用', iconPath: 'C:\\icon.png', xml })
  assert.match(script, /AppUserModelId/)
  assert.match(script, /CreateToastNotifier\(\$appId\)\.Show\(\$toast\)/)
})

test('buildPowerShellScript leaves the DSH AUMID registration to the app shortcut', () => {
  const script = buildPowerShellScript({ appId: 'com.deepseek.dsh', appName: 'DeepSeek Harness', iconPath: '', xml: '<toast/>' })
  assert.ok(script.includes("if ($appId -ne 'com.deepseek.dsh') {"))
  assert.ok(script.includes('CreateToastNotifier($appId).Show($toast)'))
})

test('createToastCommand uses windowless Windows PowerShell', () => {
  const command = createToastCommand({ xml: '<toast/>' })
  assert.match(command.file, /powershell\.exe$/iu)
  assert.ok(command.args.includes('-EncodedCommand'))
  assert.ok(command.args.includes('-NoProfile'))
  assert.ok(command.args.includes('-WindowStyle'))
})

test('sendWindowsToast resolves success through the injected runner', async () => {
  let seen
  const result = await sendWindowsToast({ xml: '<toast/>' }, (file, args, options, callback) => {
    seen = { file, args, options }
    callback(null, '', '')
  })
  assert.deepEqual(result, { ok: true })
  assert.ok(seen.file.length > 0)
  assert.ok(seen.args.includes('-EncodedCommand'))
  assert.equal(seen.options.windowsHide, true)
})

test('sendWindowsToast reports a runner failure', async () => {
  const result = await sendWindowsToast({ xml: '<toast/>' }, (_file, _args, _options, callback) => {
    const error = new Error('powershell failed')
    callback(error, '', 'access denied')
  })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'powershell failed')
  assert.equal(result.stderr, 'access denied')
})

test('sendWindowsToast contains a synchronous runner throw', async () => {
  const result = await sendWindowsToast({ xml: '<toast/>' }, () => {
    throw new Error('spawn exploded')
  })
  assert.equal(result.ok, false)
  assert.match(result.error, /spawn exploded/)
})

test('planner shows the conversation name and the assistant task summary', () => {
  const planner = createNotificationPlanner(() => config())
  const notification = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'user/message', time: 1_100, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '修复登录' }] } },
    { type: 'session/title', time: 2_000, data: { title: '登录修复' } },
    assistantMessage(3_000, '已修复 token 刷新逻辑，并补充了回归测试。'),
    { type: 'turn/end', time: 13_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.equal(notification.kind, 'turn')
  assert.equal(notification.title, '登录修复')
  assert.equal(notification.body, '已修复 token 刷新逻辑，并补充了回归测试。')
  assert.equal(notification.footer, '任务完成 · demo · 12 秒')
  assert.equal(notification.sound, true)
})

test('planner prefers the live Session title service over tracked events', () => {
  const planner = createNotificationPlanner(() => config(), { readTitle: () => '实时对话名' })
  const notification = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'user/message', time: 1_100, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '修复登录' }] } },
    assistantMessage(3_000, '已完成。'),
    { type: 'turn/end', time: 5_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.equal(notification.title, '实时对话名')
})

test('planner falls back when the live title service is unavailable', () => {
  const planner = createNotificationPlanner(() => config(), { readTitle: () => { throw new Error('disposed') } })
  const notification = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'session/title', time: 2_000, data: { title: '登录修复' } },
    { type: 'turn/end', time: 5_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.equal(notification.title, '登录修复')
})

test('planner falls back to the prompt for both name and summary', () => {
  const planner = createNotificationPlanner(() => config())
  const notification = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'user/message', time: 1_100, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '检查一下部署脚本' }] } },
    { type: 'turn/end', time: 5_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.equal(notification.title, '检查一下部署脚本')
  assert.equal(notification.body, '')
  assert.match(notification.footer, /任务完成 · demo/u)
})

test('planner falls back to the prompt when a title exists but no assistant text does', () => {
  const planner = createNotificationPlanner(() => config())
  const notification = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'user/message', time: 1_100, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '修复登录' }] } },
    { type: 'session/title', time: 2_000, data: { title: '登录修复' } },
    { type: 'turn/end', time: 5_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.equal(notification.title, '登录修复')
  assert.equal(notification.body, '修复登录')
})

test('planner truncates a long summary with an ellipsis', () => {
  const planner = createNotificationPlanner(() => config())
  const notification = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'session/title', time: 2_000, data: { title: '长任务' } },
    assistantMessage(3_000, '很长的总结'.repeat(20)),
    { type: 'turn/end', time: 5_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.ok(notification.body.endsWith('…'))
  assert.ok(notification.body.length <= 64)
})

test('planner does not reuse the previous turn summary', () => {
  const planner = createNotificationPlanner(() => config())
  const sess = session()
  run(planner, sess, [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'session/title', time: 2_000, data: { title: '对话' } },
    assistantMessage(3_000, '第一轮总结'),
    { type: 'turn/end', time: 12_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  const second = run(planner, sess, [
    { type: 'turn/start', time: 20_000, data: { turn: 2 } },
    { type: 'user/message', time: 20_100, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '第二轮任务' }] } },
    { type: 'turn/end', time: 25_000, data: { turn: 2, reason: { kind: 'completed' } } },
  ])
  assert.equal(second.body, '第二轮任务')
})

test('planner suppresses a turn shorter than minDurationMs', () => {
  const planner = createNotificationPlanner(() => config({ minDurationMs: 20_000 }))
  const notification = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'turn/end', time: 5_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.equal(notification, undefined)
})

test('planner can use the prompt timestamp when turn/start was missed', () => {
  const planner = createNotificationPlanner(() => config({ minDurationMs: 5_000 }))
  const notification = planner.observe(session(), {
    type: 'user/message',
    time: 1_000,
    data: { source: { kind: 'user' }, content: [{ type: 'text', text: '慢任务' }] },
  })
  assert.equal(notification, undefined)
  const ended = planner.observe(session(), { type: 'turn/end', time: 10_000, data: { turn: 1, reason: { kind: 'completed' } } })
  assert.ok(ended)
  assert.equal(ended.title, '慢任务')
  assert.match(ended.footer, /9 秒/u)
})

test('planner suppresses subagent turns unless configured', () => {
  const subagent = session({ header: { cwd: 'E:\\work\\demo', origin: 'subagent' } })
  const silent = createNotificationPlanner(() => config())
  assert.equal(run(silent, subagent, [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'turn/end', time: 5_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ]), undefined)

  const loud = createNotificationPlanner(() => config({ notifyOnSubagents: true }))
  const notification = run(loud, subagent, [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'turn/end', time: 5_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.equal(notification.title, 'DeepSeek Harness')
  assert.match(notification.footer, /子任务完成/u)
})

test('planner reports failures with the provider message', () => {
  const planner = createNotificationPlanner(() => config())
  const notification = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'turn/end', time: 5_000, data: { turn: 1, reason: { kind: 'error', error: { message: 'upstream timeout', code: 'TIMEOUT' } } } },
  ])
  assert.equal(notification.title, 'DeepSeek Harness')
  assert.equal(notification.body, 'upstream timeout')
  assert.match(notification.footer, /任务出错/u)
})

test('planner exposes the output limit in the summary', () => {
  const planner = createNotificationPlanner(() => config())
  const notification = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'turn/end', time: 5_000, data: { turn: 1, reason: { kind: 'max-tokens' } } },
  ])
  assert.match(notification.body, /输出上限/u)
  assert.match(notification.footer, /输出上限/u)
})

test('planner notifies failures below the minimum duration', () => {
  const planner = createNotificationPlanner(() => config({ minDurationMs: 20_000 }))
  const failed = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'turn/end', time: 3_000, data: { turn: 1, reason: { kind: 'error', error: { message: '401' } } } },
  ])
  assert.ok(failed)
  const limited = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 2 } },
    { type: 'turn/end', time: 3_000, data: { turn: 2, reason: { kind: 'max-tokens' } } },
  ])
  assert.ok(limited)
})

test('planner skips aborted turns by default and allows opting in', () => {
  const events = [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'turn/end', time: 5_000, data: { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } } },
  ]
  assert.equal(run(createNotificationPlanner(() => config()), session(), events), undefined)
  const enabled = run(createNotificationPlanner(() => config({ notifyOnAborted: true })), session(), events)
  assert.equal(enabled.title, 'DeepSeek Harness')
  assert.match(enabled.footer, /任务已停止/u)
})

test('planner notifies completed background jobs and ignores killed jobs', () => {
  const planner = createNotificationPlanner(() => config({ minDurationMs: 1_000 }))
  const notification = planner.observe(session(), { type: 'job/settled', time: 75_000, data: jobData() })
  assert.equal(notification.kind, 'job')
  assert.equal(notification.title, 'DeepSeek Harness')
  assert.equal(notification.body, 'pnpm test')
  assert.match(notification.footer, /后台任务完成/u)
  assert.match(notification.footer, /1 分 5 秒/u)
  assert.match(notification.footer, /exit code: 0/u)

  const killed = planner.observe(session(), {
    type: 'job/settled',
    time: 75_000,
    data: jobData({ status: 'killed', cause: 'kill' }),
  })
  assert.equal(killed, undefined)
})

test('planner includes the Harness click hint when clickUrl is set', () => {
  const planner = createNotificationPlanner(() => config({ clickUrl: 'dsh://open' }))
  const notification = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'user/message', time: 1_100, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '完成任务' }] } },
    assistantMessage(3_000, '已完成。'),
    { type: 'turn/end', time: 13_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.match(notification.footer, /任务完成 · demo · 12 秒 · 点击打开 Harness/u)
})

test('planner ignores a foreground shell job', () => {
  const planner = createNotificationPlanner(() => config({ minDurationMs: 0 }))
  const sess = session()
  planner.observe(sess, {
    type: 'tool/ptc-dispatch-start',
    time: 500,
    data: {
      name: 'pwsh', subCallId: 'call-1:ptc:1', rootCallId: 'call-1', parentCallId: 'call-1',
      arguments: { command: 'long foreground command', run_in_background: false },
    },
  })
  assert.equal(planner.observe(sess, {
    type: 'job/settled',
    time: 12_000,
    data: jobData({
      jobId: 'pwsh-1', kind: 'pwsh', label: 'long foreground command',
      startedAt: 1_000, finishedAt: 12_000,
      toolCall: { callId: 'call-1:ptc:1', rootCallId: 'call-1' },
    }),
  }), undefined)
})

test('planner notifies a background shell job from run_code arguments', () => {
  const planner = createNotificationPlanner(() => config({ minDurationMs: 0 }))
  const sess = session()
  planner.observe(sess, {
    type: 'tool/ptc-dispatch-start',
    time: 500,
    data: {
      name: 'pwsh', subCallId: 'call-2:ptc:1', rootCallId: 'call-2', parentCallId: 'call-2',
      arguments: { command: 'long background command', run_in_background: true },
    },
  })
  const notification = planner.observe(sess, {
    type: 'job/settled',
    time: 12_000,
    data: jobData({
      jobId: 'pwsh-2', kind: 'pwsh', label: 'long background command',
      startedAt: 1_000, finishedAt: 12_000,
      toolCall: { callId: 'call-2:ptc:1', rootCallId: 'call-2' },
    }),
  })
  assert.ok(notification)
  assert.match(notification.footer, /后台任务完成/u)
})

test('planner detects a native background shell tool call from raw arguments', () => {
  const planner = createNotificationPlanner(() => config({ minDurationMs: 0 }))
  const sess = session()
  planner.observe(sess, {
    type: 'tool/call',
    time: 500,
    data: { name: 'bash', callId: 'call-3', arguments: JSON.stringify({ command: 'pnpm test', run_in_background: true }) },
  })
  const notification = planner.observe(sess, {
    type: 'job/settled',
    time: 12_000,
    data: jobData({
      jobId: 'bash-3', kind: 'bash', label: 'pnpm test',
      startedAt: 1_000, finishedAt: 12_000,
      toolCall: { callId: 'call-3', rootCallId: 'call-3' },
    }),
  })
  assert.ok(notification)
})

test('planner skips short completed background jobs but reports short failures', () => {
  const planner = createNotificationPlanner(() => config({ minDurationMs: 5_000 }))
  const base = {
    jobId: 'bash-1', owner: 'session-1', kind: 'bash', label: 'echo hi',
    startedAt: 2_000, finishedAt: 4_000, cause: 'producer', producerReported: true,
  }
  assert.equal(planner.observe(session(), {
    type: 'job/settled', time: 4_000, data: { ...base, status: 'completed', detail: 'exit code: 0' },
  }), undefined)
  const failed = planner.observe(session(), {
    type: 'job/settled', time: 4_000, data: { ...base, status: 'failed', detail: 'exit code: 1' },
  })
  assert.ok(failed)
  assert.match(failed.footer, /后台任务失败/u)
})

test('planner forget clears its per-session state', () => {
  const planner = createNotificationPlanner(() => config())
  const sess = session()
  planner.observe(sess, {
    type: 'user/message',
    time: 1_000,
    data: { source: { kind: 'user' }, content: [{ type: 'text', text: '旧任务' }] },
  })
  planner.observe(sess, { type: 'turn/start', time: 1_000, data: { turn: 9 } })
  planner.forget(sess)
  const notification = planner.observe(sess, {
    type: 'turn/end',
    time: 5_000,
    data: { turn: 1, reason: { kind: 'completed' } },
  })
  assert.equal(notification.title, 'DeepSeek Harness')
  assert.equal(notification.body, '')
  assert.match(notification.footer, /任务完成 · demo/u)
})

test('planner ignores disabled configuration', () => {
  const planner = createNotificationPlanner(() => config({ enabled: false }))
  const notification = run(planner, session(), [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'turn/end', time: 5_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.equal(notification, undefined)
})
