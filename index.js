/**
 * Host half of dsh-windows-notify.
 *
 * The plugin observes committed Session events. A completed top-level turn, a
 * failed top-level turn, or a settled background job longer than the configured
 * minimum raises one Windows toast. Subagent turns stay silent unless explicitly
 * enabled, because the parent turn reports their outcome.
 *
 * Toast delivery is intentionally fire-and-forget: Session event observers may
 * not await asynchronous work, and a notification must never delay or fail a
 * turn.
 *
 * @module dsh-windows-notify
 */

import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_APP_ID,
  DEFAULT_APP_NAME,
  DEFAULT_MIN_DURATION_MS,
  buildToastXml,
  createNotificationPlanner,
  sendWindowsToast,
} from './notify.js'

/** Bundled DSH whale icon shown in the notification's top-left corner. */
const APP_ICON_FILE = fileURLToPath(new URL('./assets/dsh-whale.png', import.meta.url))
/** Bundled celebration artwork shown in the right column of the toast. */
const CONTENT_IMAGE_FILE = fileURLToPath(new URL('./assets/celebrate.png', import.meta.url))
/** The content image is a local ToastGeneric source. */
const CONTENT_IMAGE_URI = existsSync(CONTENT_IMAGE_FILE) ? pathToFileURL(CONTENT_IMAGE_FILE).href : ''

export const name = 'windows-notify'

export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  minDurationMs: z.natural().max(86_400_000).default(DEFAULT_MIN_DURATION_MS).volatile(),
  notifyOnCompleted: z.boolean().default(true).volatile(),
  notifyOnError: z.boolean().default(true).volatile(),
  notifyOnAborted: z.boolean().default(false).volatile(),
  notifyOnJobs: z.boolean().default(true).volatile(),
  notifyOnSubagents: z.boolean().default(false).volatile(),
  showPromptPreview: z.boolean().default(true).volatile(),
  sound: z.boolean().default(true).volatile(),
  language: z.union(['auto', 'zh', 'en']).default('auto').volatile(),
  appName: z.string().min(1).default(DEFAULT_APP_NAME).volatile(),
  appId: z.string().pattern(/^[A-Za-z0-9._-]+$/u).default(DEFAULT_APP_ID).volatile(),
  iconPath: z.string().default('').volatile(),
  clickUrl: z.string().default('dsh://open').volatile(),
})

/**
 * Read one possibly volatile configuration field.
 * @param config - plugin configuration object.
 * @param key - field name.
 * @param fallback - value used when the field is absent.
 * @returns the live field value.
 */
function readField(config, key, fallback) {
  const source = config !== null && typeof config === 'object' && typeof config.get === 'function' ? config.get() : config
  const raw = source === null || source === undefined ? undefined : source[key]
  const current = raw !== null && typeof raw === 'object' && typeof raw.get === 'function' ? raw.get() : raw
  return current === undefined ? fallback : current
}

/** Read one boolean field, preserving the schema default. */
function readBoolean(config, key, fallback) {
  const value = readField(config, key, fallback)
  return typeof value === 'boolean' ? value : fallback
}

/** Read one integer field inside a closed range. */
function readInteger(config, key, fallback, min, max) {
  const value = Number(readField(config, key, fallback))
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** Read one trimmed string field. */
function readString(config, key, fallback) {
  const value = readField(config, key, fallback)
  return typeof value === 'string' ? value.trim() : fallback
}

/** Normalize a click target; only HTTP(S) URLs become toast activation targets. */
function clickTarget(value) {
  return /^(?:https?:\/\/|dsh:\/\/)\S+$/iu.test(value) ? value : ''
}

/**
 * Resolve the live, validated configuration. The schema validates stored values;
 * this normalization protects a running plugin from hot-reload races and from a
 * configuration document edited directly on disk.
 * @param config - plugin configuration object.
 * @returns normalized settings used by the planner and sender.
 */
export function normalizeConfig(config) {
  const appName = readString(config, 'appName', DEFAULT_APP_NAME).slice(0, 64) || DEFAULT_APP_NAME
  const appId = readString(config, 'appId', DEFAULT_APP_ID)
  const language = readString(config, 'language', 'auto')
  return {
    enabled: readBoolean(config, 'enabled', true),
    minDurationMs: readInteger(config, 'minDurationMs', DEFAULT_MIN_DURATION_MS, 0, 86_400_000),
    notifyOnCompleted: readBoolean(config, 'notifyOnCompleted', true),
    notifyOnError: readBoolean(config, 'notifyOnError', true),
    notifyOnAborted: readBoolean(config, 'notifyOnAborted', false),
    notifyOnJobs: readBoolean(config, 'notifyOnJobs', true),
    notifyOnSubagents: readBoolean(config, 'notifyOnSubagents', false),
    showPromptPreview: readBoolean(config, 'showPromptPreview', true),
    sound: readBoolean(config, 'sound', true),
    language: language === 'zh' || language === 'en' ? language : 'auto',
    appName,
    appId: appId === '' || appId === 'DeepSeekHarness.Notify'
      ? DEFAULT_APP_ID
      : (/^[A-Za-z0-9._-]+$/u.test(appId) ? appId : DEFAULT_APP_ID),
    iconPath: readString(config, 'iconPath', ''),
    clickUrl: clickTarget(readString(config, 'clickUrl', 'dsh://open')) || 'dsh://open',
  }
}

/**
 * Install the Session observer. The plugin is silent and inert off Windows.
 * @param ctx - Cordis context owning the plugin.
 * @param config - validated plugin configuration.
 */
export function apply(ctx, config) {
  if (process.platform !== 'win32') {
    ctx.logger?.info?.('[windows-notify] Windows toast notifications are unavailable on ' + process.platform + '; plugin idle.')
    return
  }

  const planner = createNotificationPlanner(() => normalizeConfig(config), {
    readTitle: (session) => {
      if (typeof ctx.get !== 'function') return undefined
      const titleService = ctx.get('sessionTitle')
      if (titleService === undefined) return undefined
      try {
        return titleService.get(session)?.title
      } catch {
        return undefined
      }
    },
  })

  ctx.on('session/event', (session, event) => {
    let notification
    try {
      notification = planner.observe(session, event)
    } catch (error) {
      ctx.logger?.warn?.('[windows-notify] could not plan a notification: ' + String(error))
      return
    }
    if (notification === undefined) return

    // The DSH AUMID takes its header icon and name from the Desktop Start Menu
    // shortcut. A custom AUMID falls back to the bundled whale tile.
    const aumidIcon = notification.appId === DEFAULT_APP_ID
      ? ''
      : (notification.iconPath === '' ? APP_ICON_FILE : notification.iconPath)
    let xml
    try {
      xml = buildToastXml({
        title: notification.title,
        body: notification.body,
        footer: notification.footer,
        silent: notification.sound === false,
        clickUrl: notification.clickUrl,
        image: CONTENT_IMAGE_URI,
      })
    } catch (error) {
      ctx.logger?.warn?.('[windows-notify] could not build toast XML: ' + String(error))
      return
    }

    void sendWindowsToast({
      appId: notification.appId,
      appName: notification.appName,
      iconPath: aumidIcon,
      xml,
    }).then((result) => {
      if (result.ok || result.reason === 'platform') return
      const detail = result.stderr === undefined || result.stderr === '' ? '' : ' | ' + result.stderr
      ctx.logger?.warn?.('[windows-notify] toast failed: ' + String(result.error ?? result.reason) + detail)
    }).catch((error) => {
      ctx.logger?.warn?.('[windows-notify] toast sender rejected: ' + String(error))
    })
  })

  ctx.on('session/disposed', (session) => {
    planner.forget(session)
  })
}
