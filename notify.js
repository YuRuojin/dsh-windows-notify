/**
 * Windows toast notification primitives and turn/job notification planning.
 *
 * Everything here is plain Node: no Electron API and no DSH service is
 * required. The host plugin reads Session events, this module turns the
 * interesting ones into a small notification plan, and sendWindowsToast hands
 * the plan to Windows PowerShell 5.1, which owns the WinRT toast call.
 *
 * @module dsh-windows-notify/notify
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Default AppUserModelID. The DSH Desktop Start Menu shortcut owns this AUMID,
 * so the toast header uses the black-and-white Harness whale and app name.
 */
export const DEFAULT_APP_ID = 'com.deepseek.dsh'

/** Default application name shown above a toast. */
export const DEFAULT_APP_NAME = 'DeepSeek Harness'

/** Default minimum task duration before a toast is worth showing. */
export const DEFAULT_MIN_DURATION_MS = 8000

/**
 * Windows system sounds a toast may reference. Windows toasts do not play
 * custom audio files; the chooser is the supported system event sound set.
 */
export const SOUND_SOURCES = {
  default: '',
  im: 'ms-winsoundevent:Notification.IM',
  mail: 'ms-winsoundevent:Notification.Mail',
  reminder: 'ms-winsoundevent:Notification.Reminder',
  sms: 'ms-winsoundevent:Notification.SMS',
}

/**
 * Resolve one configured sound kind to its toast audio source.
 * @param kind - configured sound kind; unknown values fall back to default.
 * @returns the audio source, or '' for the Windows default sound.
 */
export function resolveSoundSource(kind) {
  const key = typeof kind === 'string' && Object.hasOwn(SOUND_SOURCES, kind) ? kind : 'default'
  return SOUND_SOURCES[key]
}

/** Longest title/body/footer retained from one event. */
const MAX_LINE = 300

/**
 * Escape one value for XML text or a double-quoted XML attribute.
 * @param value - text to escape.
 * @returns XML-safe text.
 */
export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/**
 * Collapse whitespace and control characters, then bound the result.
 * @param value - raw text from a Session event or configuration.
 * @param max - maximum retained UTF-16 code units.
 * @returns the normalized single-line text.
 */
export function normalizeText(value, max = MAX_LINE) {
  const text = (typeof value === 'string' ? value : String(value ?? ''))
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (text.length <= max) return text
  return text.slice(0, Math.max(0, max - 1)) + '…'
}

/**
 * Resolve the notification language from an explicit preference or the host
 * system locale.
 * @param preference - 'auto', 'zh', or 'en'.
 * @returns 'zh' or 'en'.
 */
export function resolveLanguage(preference) {
  if (preference === 'zh' || preference === 'en') return preference
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale
    if (/^zh/iu.test(locale)) return 'zh'
    if (/^en/iu.test(locale)) return 'en'
  } catch {
    // Intl can be absent in stripped runtimes; fall through to environment text.
  }
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || ''
  return /^zh/iu.test(env) ? 'zh' : 'en'
}

/**
 * Format a duration for a compact toast line.
 * @param milliseconds - elapsed task time.
 * @param language - 'zh' or 'en'.
 * @returns a short human-readable duration.
 */
export function formatDuration(milliseconds, language = 'en') {
  const numeric = Number(milliseconds)
  const total = !Number.isFinite(numeric) || numeric <= 0 ? 0 : Math.max(1, Math.round(numeric / 1000))
  if (language === 'zh') {
    if (total < 60) return total + ' 秒'
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    if (minutes < 60) return seconds === 0 ? minutes + ' 分钟' : minutes + ' 分 ' + seconds + ' 秒'
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest === 0 ? hours + ' 小时' : hours + ' 小时 ' + rest + ' 分'
  }
  if (total < 60) return total + 's'
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return seconds === 0 ? minutes + 'm' : minutes + 'm ' + seconds + 's'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? hours + 'h' : hours + 'h ' + rest + 'm'
}

/**
 * Read the display name of a Session's working directory.
 * @param session - the Session that produced the event.
 * @param fallback - application name used when the Session has no cwd.
 * @returns a short project label.
 */
export function projectName(session, fallback = DEFAULT_APP_NAME) {
  const cwd = session?.header?.cwd
  if (typeof cwd === 'string') {
    const parts = cwd.replace(/[\\/]+$/u, '').split(/[\\/]/u).filter(Boolean)
    const last = parts.at(-1)
    if (last) return normalizeText(last, 60)
  }
  return normalizeText(fallback, 60)
}

/**
 * Extract text blocks from one user message.
 * @param content - message content blocks.
 * @returns joined text, or an empty string.
 */
function textOfContent(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
}

/**
 * Whether one Session is a subagent child.
 * @param session - Session to inspect.
 * @returns true for a subagent child.
 */
export function isSubagent(session) {
  return session?.header?.origin === 'subagent'
}

/**
 * Build the ToastGeneric XML document.
 * @param options - visible lines, sound choice, and optional click target.
 * @returns one XML document string.
 */
export function buildToastXml({ title = '', body = '', footer = '', silent = false, audio = '', clickUrl = '', appLogo = '', image = '' } = {}) {
  const lines = [title, body, footer]
    .map(line => normalizeText(line, MAX_LINE))
    .filter(Boolean)
  const appLogoXml = appLogo === ''
    ? ''
    : '<image placement="appLogoOverride" src="' + escapeXml(appLogo) + '" />'
  const activation = clickUrl === '' ? '' : ' activationType="protocol" launch="' + escapeXml(clickUrl) + '"'
  const audioXml = silent
    ? '<audio silent="true" />'
    : (audio === '' ? '' : '<audio src="' + escapeXml(audio) + '" />')
  const textXml = image === ''
    ? lines.map(line => '<text>' + escapeXml(line) + '</text>').join('')
    : lines.map((line, index) => '<text hint-style="' + (index === 0 ? 'base' : index === 1 ? 'baseSubtle' : 'captionSubtle') + '">' + escapeXml(line) + '</text>').join('')
  const content = image === ''
    ? textXml
    : textXml + '<image src="' + escapeXml(image) + '" />'
  return '<toast' + activation + '><visual branding="none"><binding template="ToastGeneric" branding="none">' + appLogoXml + content + '</binding></visual>' + audioXml + '</toast>'
}

/**
 * Build the Windows PowerShell 5.1 script that registers the toast AppUserModelID
 * and shows one toast. The payload travels as Base64 UTF-8 JSON, so quotes,
 * newlines, and non-ASCII text need no PowerShell escaping.
 * @param options - App identity and Toast XML.
 * @returns a PowerShell script body.
 */
export function buildPowerShellScript({ appId = DEFAULT_APP_ID, appName = DEFAULT_APP_NAME, iconPath = '', xml = '' } = {}) {
  const payload = Buffer.from(JSON.stringify({
    appId: String(appId),
    appName: String(appName),
    iconPath: String(iconPath ?? ''),
    xml: String(xml),
  }), 'utf8').toString('base64')
  return [
    "$ErrorActionPreference = 'Stop'",
    "$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + payload + "')) | ConvertFrom-Json",
    '$appId = [string]$payload.appId',
    '$appName = [string]$payload.appName',
    '$iconPath = [string]$payload.iconPath',
    "if ($appId -ne 'com.deepseek.dsh') {",
    "  $parent = 'HKCU:\\Software\\Classes\\AppUserModelId'",
    '  if (-not (Test-Path -Path $parent)) { New-Item -Path $parent -Force | Out-Null }',
    "  $key = $parent + '\\' + $appId",
    '  if (-not (Test-Path -Path $key)) { New-Item -Path $key -Force | Out-Null }',
    "  Set-ItemProperty -Path $key -Name 'DisplayName' -Value $appName",
    '  if ($iconPath.Length -gt 0) {',
    "    Set-ItemProperty -Path $key -Name 'IconUri' -Value $iconPath",
    '  } else {',
    "    Remove-ItemProperty -Path $key -Name 'IconUri' -ErrorAction SilentlyContinue",
    '  }',
    '}',
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null',
    '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] | Out-Null',
    '$document = New-Object Windows.Data.Xml.Dom.XmlDocument',
    '$document.LoadXml([string]$payload.xml)',
    '$toast = New-Object Windows.UI.Notifications.ToastNotification $document',
    '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)',
  ].join('\n')
}

/**
 * Locate Windows PowerShell 5.1. PowerShell 7 cannot load the WinRT types the
 * toast API needs, so this deliberately does not fall back to pwsh.
 * @returns an absolute path when the standard installation exists, otherwise
 *   the command name resolved by the operating system.
 */
export function powershellPath() {
  const root = process.env.SystemRoot || process.env.windir
  if (root) {
    const candidate = join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    if (existsSync(candidate)) return candidate
  }
  return 'powershell.exe'
}

/**
 * Build the exact PowerShell invocation for one toast.
 * @param options - App identity and Toast XML.
 * @returns executable path and arguments.
 */
export function createToastCommand(options) {
  const script = buildPowerShellScript(options)
  return {
    file: powershellPath(),
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
  }
}

/**
 * Show one Windows toast without blocking the caller.
 * @param options - App identity and visible lines.
 * @param run - child-process runner, injectable for tests.
 * @returns a settled result; platform absence is not an error.
 */
export function sendWindowsToast(options, run = execFile) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ ok: false, reason: 'platform' })
      return
    }
    let command
    try {
      command = createToastCommand(options)
    } catch (error) {
      resolve({ ok: false, error: String(error) })
      return
    }
    try {
      run(command.file, command.args, { windowsHide: true, timeout: 15000 }, (error, _stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            error: String(error.message ?? error),
            stderr: normalizeText(stderr, 500),
          })
          return
        }
        resolve({ ok: true })
      })
    } catch (error) {
      resolve({ ok: false, error: String(error) })
    }
  })
}

/** Whether a turn reason should produce a toast under this configuration. */
function shouldNotifyTurn(config, reason) {
  switch (reason?.kind) {
    case 'completed': return config.notifyOnCompleted
    case 'error': return config.notifyOnError
    case 'max-tokens': return config.notifyOnError
    case 'aborted': return config.notifyOnAborted
    default: return false
  }
}

/** Visible status line for one turn reason. */
function turnStatus(reason, subagent, language) {
  const zh = language === 'zh'
  switch (reason?.kind) {
    case 'completed': return zh ? (subagent ? '子任务完成' : '任务完成') : (subagent ? 'Subagent completed' : 'Task completed')
    case 'error': return zh ? (subagent ? '子任务出错' : '任务出错') : (subagent ? 'Subagent failed' : 'Task failed')
    case 'max-tokens': return zh ? (subagent ? '子任务达到输出上限' : '任务达到输出上限') : (subagent ? 'Subagent hit the output limit' : 'Task hit the output limit')
    case 'aborted': return zh ? (subagent ? '子任务已停止' : '任务已停止') : (subagent ? 'Subagent stopped' : 'Task stopped')
    default: return zh ? '任务结束' : 'Task ended'
  }
}

/** Failure detail for one turn reason. */
function failureDetail(reason) {
  const message = normalizeText(reason?.error?.message, 180)
  if (message) return message
  return normalizeText(reason?.error?.code, 60)
}

/** Click hint appended to a toast when the toast is clickable. */
function clickHint(language) {
  return language === 'zh' ? '点击打开 Harness' : 'Click to open Harness'
}

/** Build one notification plan for a finished turn. */
function buildTurnNotification({ config, session, reason, durationMs, prompt, title, summary, language }) {
  const subagent = isSubagent(session)
  const status = turnStatus(reason, subagent, language)
  const project = projectName(session, config.appName)
  const duration = durationMs > 0 ? formatDuration(durationMs, language) : ''
  const titleLimit = language === 'zh' ? 32 : 64
  const summaryLimit = language === 'zh' ? 64 : 120
  const conversation = normalizeText(title || prompt || config.appName, titleLimit)
  const detail = reason?.kind === 'error' ? failureDetail(reason) : ''
  const note = reason?.kind === 'max-tokens'
    ? (language === 'zh' ? '已达到输出上限，可以继续让它接着做' : 'Output limit reached; continue the task if needed')
    : ''
  const candidate = config.showPromptPreview
    ? normalizeText(summary || (title ? prompt : '') || '', summaryLimit)
    : ''
  const body = detail || candidate || note
  let footer = [status, project, duration].filter(Boolean).join(' · ')
  if (config.clickUrl) footer = footer + ' · ' + clickHint(language)
  return {
    kind: 'turn',
    sessionId: String(session.id),
    title: conversation,
    body: normalizeText(body, 220),
    footer: normalizeText(footer, 220),
    sound: config.sound,
    soundSrc: resolveSoundSource(config.soundKind),
    imagePath: config.imagePath,
    clickUrl: config.clickUrl,
    appId: config.appId,
    appName: config.appName,
    iconPath: config.iconPath,
  }
}

/** Build one notification plan for a settled background job. */
function buildJobNotification({ config, session, data, durationMs, title, language }) {
  const failed = data.status === 'failed'
  const status = failed
    ? (language === 'zh' ? '后台任务失败' : 'Background job failed')
    : (language === 'zh' ? '后台任务完成' : 'Background job completed')
  const project = projectName(session, config.appName)
  const duration = durationMs > 0 ? formatDuration(durationMs, language) : ''
  const titleLimit = language === 'zh' ? 32 : 64
  const conversation = normalizeText(title || config.appName, titleLimit)
  const label = normalizeText(data.label, language === 'zh' ? 64 : 100) || normalizeText(data.kind, 40)
  let footer = [status, project, duration].filter(Boolean).join(' · ')
  const detail = normalizeText(data.detail, 60)
  if (detail) footer = footer + ' · ' + detail
  if (config.clickUrl) footer = footer + ' · ' + clickHint(language)
  return {
    kind: 'job',
    sessionId: String(session.id),
    title: conversation,
    body: label,
    footer: normalizeText(footer, 220),
    sound: config.sound,
    soundSrc: resolveSoundSource(config.soundKind),
    imagePath: config.imagePath,
    clickUrl: config.clickUrl,
    appId: config.appId,
    appName: config.appName,
    iconPath: config.iconPath,
  }
}

/** Shell tools whose foreground calls also register a job. */
const SHELL_TOOL_NAMES = new Set(['bash', 'pwsh'])

/** Parse a raw tool-call argument string without letting malformed JSON break observation. */
function parseToolArguments(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

/** Whether a shell tool invocation requested background execution. */
function isBackgroundShellCall(args) {
  return args !== null && typeof args === 'object' && args.run_in_background === true
}

/**
 * Build the per-plugin notification planner. It keeps only the small amount of
 * Session state needed to time a turn and name it; it does not read or retain
 * the Session event log.
 * @param getConfig - reads the current normalized plugin configuration.
 * @param options - optional live title reader; the Session title service is the
 *   source of truth, while the tracked title event covers runtimes without it.
 * @returns a planner driven by session/event and session/disposed.
 */
export function createNotificationPlanner(getConfig, options = {}) {
  const readTitle = typeof options.readTitle === 'function' ? options.readTitle : undefined
  const turns = new Map()
  const prompts = new Map()
  const titles = new Map()
  const summaries = new Map()
  const ptcStarts = new Map()
  const toolCalls = new Map()
  const turnKey = (sessionId, turn) => sessionId + '\u0000' + turn
  const callKey = (sessionId, callId) => sessionId + '\u0000' + callId
  const titleOf = (session, sessionId) => {
    if (readTitle !== undefined) {
      try {
        const title = readTitle(session)
        if (typeof title === 'string' && title !== '') return title
      } catch {
        // The title service is optional and may reject for a disposed Session.
      }
    }
    return titles.get(sessionId) ?? ''
  }

  return {
    /**
     * Fold one Session event into notification state.
     * @param session - the Session that produced the event.
     * @param event - one committed Session event.
     * @returns a notification plan, or undefined when nothing should be shown.
     */
    observe(session, event) {
      const sessionId = String(session.id)
      if (event.type === 'turn/start') {
        turns.set(turnKey(sessionId, event.data.turn), { startedAt: event.time })
        summaries.delete(sessionId)
        return undefined
      }
      if (event.type === 'user/message') {
        if (event.data?.source?.kind === 'user') {
          const text = normalizeText(textOfContent(event.data.content), 4000)
          if (text !== '') prompts.set(sessionId, { text, at: event.time })
        }
        return undefined
      }
      if (event.type === 'session/title') {
        if (typeof event.data?.title === 'string') titles.set(sessionId, event.data.title)
        return undefined
      }
      if (event.type === 'assistant/message') {
        const text = normalizeText(textOfContent(event.data?.message?.content), 4000)
        if (text !== '') summaries.set(sessionId, text)
        return undefined
      }
      if (event.type === 'tool/ptc-dispatch-start') {
        if (SHELL_TOOL_NAMES.has(event.data?.name)) {
          ptcStarts.set(callKey(sessionId, event.data.subCallId), parseToolArguments(event.data.arguments))
        }
        return undefined
      }
      if (event.type === 'tool/call') {
        if (SHELL_TOOL_NAMES.has(event.data?.name)) {
          toolCalls.set(callKey(sessionId, event.data.callId), parseToolArguments(event.data.arguments))
        }
        return undefined
      }
      if (event.type === 'turn/end') {
        const key = turnKey(sessionId, event.data?.turn)
        const started = turns.get(key)
        turns.delete(key)
        const config = getConfig()
        if (!config.enabled) return undefined
        if (isSubagent(session) && !config.notifyOnSubagents) return undefined
        const reason = event.data?.reason
        if (!shouldNotifyTurn(config, reason)) return undefined
        const prompt = prompts.get(sessionId)
        const startedAt = started?.startedAt ?? prompt?.at
        const durationMs = startedAt === undefined ? 0 : Math.max(0, event.time - startedAt)
        const critical = reason?.kind === 'error' || reason?.kind === 'max-tokens'
        if (!critical && durationMs < config.minDurationMs) return undefined
        const summary = summaries.get(sessionId) ?? ''
        summaries.delete(sessionId)
        return buildTurnNotification({
          config,
          session,
          reason,
          durationMs,
          prompt: prompt?.text ?? '',
          title: titleOf(session, sessionId),
          summary,
          language: resolveLanguage(config.language),
        })
      }
      if (event.type === 'job/settled') {
        const config = getConfig()
        if (!config.enabled || !config.notifyOnJobs) return undefined
        if (isSubagent(session) && !config.notifyOnSubagents) return undefined
        const data = event.data
        if (data?.status !== 'completed' && data?.status !== 'failed') return undefined
        // Foreground shell calls are registry jobs too. Only a shell call that
        // explicitly requested run_in_background is a user-visible background
        // job; other job kinds are background by nature.
        if ((data.kind === 'bash' || data.kind === 'pwsh') && data.toolCall !== undefined) {
          const subArgs = ptcStarts.get(callKey(sessionId, data.toolCall.callId))
          const rootArgs = toolCalls.get(callKey(sessionId, data.toolCall.rootCallId))
          const args = subArgs !== undefined ? subArgs : rootArgs
          ptcStarts.delete(callKey(sessionId, data.toolCall.callId))
          if (!isBackgroundShellCall(args)) return undefined
        }
        const durationMs = Math.max(0, Number(data.finishedAt) - Number(data.startedAt))
        if (!Number.isFinite(durationMs)) return undefined
        if (data.status !== 'failed' && durationMs < config.minDurationMs) return undefined
        return buildJobNotification({
          config,
          session,
          data,
          durationMs,
          title: titleOf(session, sessionId),
          language: resolveLanguage(config.language),
        })
      }
      return undefined
    },

    /**
     * Drop state for one disposed Session.
     * @param session - Session being disposed.
     */
    forget(session) {
      const sessionId = String(session?.id ?? session)
      for (const key of turns.keys()) {
        if (key.startsWith(sessionId + '\u0000')) turns.delete(key)
      }
      prompts.delete(sessionId)
      titles.delete(sessionId)
      summaries.delete(sessionId)
      const prefix = sessionId + '\u0000'
      for (const key of ptcStarts.keys()) if (key.startsWith(prefix)) ptcStarts.delete(key)
      for (const key of toolCalls.keys()) if (key.startsWith(prefix)) toolCalls.delete(key)
    },
  }
}
