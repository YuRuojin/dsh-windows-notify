/**
 * Plugins-page configuration for dsh-windows-notify.
 *
 * The page edits the live configuration through the standard config form: only
 * changed fields are sent, and the host hot-reloads the plugin after the write.
 */
window.__ModuleLoader__.load({
  id: 'dsh-windows-notify',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'windowsNotify'

    const zh = {
      title: '任务完成通知',
      hint: '任务结束或后台任务完成后，用 Windows 系统通知提醒你。短于最短时长的任务不提醒；保存后立即生效。',
      summaryOn: '已启用',
      summaryOff: '已关闭',
      summaryDuration: '最短 ',
      summarySecond: ' 秒',
      unavailable: '该行当前不可配置（配置文档未提供）。',
      triggers: '触发条件',
      enabled: '启用通知',
      minDuration: '完成类提醒最短时长（秒）',
      minDurationHint: '完成类任务短于这个时长不提醒；失败和输出上限不受限制。设为 0 表示每次都提醒。',
      notifyOnCompleted: '任务完成时提醒',
      notifyOnError: '任务出错或达到输出上限时提醒',
      notifyOnAborted: '用户中断时也提醒',
      notifyOnJobs: '后台任务结束时提醒',
      notifyOnSubagents: '子智能体结束时也提醒',
      display: '显示与行为',
      showPromptPreview: '显示任务总结',
      showPromptPreviewHint: '关闭后只显示对话名、状态和耗时。',
      sound: '播放提示音',
      soundKind: '提示音样式',
      soundKindHint: 'Windows 系统事件音，仅“播放提示音”打开时生效。',
      soundDefault: '系统默认',
      soundIm: '消息',
      soundMail: '邮件',
      soundReminder: '提醒',
      soundSms: '短信',
      imagePath: '通知配图',
      imagePathHint: '留空用内置庆祝图；可填本地图片绝对路径或 http(s) 图片地址；填 none 隐藏配图。路径无效时回退内置图。',
      iconPath: '通知图标路径（高级）',
      iconPathHint: '通知头部的图标，仅在自定义通知身份 appId 时生效；留空用内置鲸鱼图标。',
      language: '通知语言',
      languageAuto: '跟随系统',
      languageZh: '中文',
      languageEn: 'English',
      appName: '通知中的应用名称',
      appNameHint: '显示在系统通知的顶部。',
      clickUrl: '点击通知打开的地址',
      clickUrlHint: '默认 dsh://open，点击会聚焦/打开 DeepSeek Harness；也可填 http/https 地址。',
      save: '保存',
      saving: '保存中…',
      failed: '保存未通过：Host 拒绝了这次修改，草稿已保留。',
      savedNote: '保存后立即生效；通知身份 appId 可在 cordis.patch.yml 中调整。',
    }
    const en = {
      title: 'Task notifications',
      hint: 'Raise a Windows toast when a task or background job finishes. Tasks shorter than the minimum stay silent; saving applies immediately.',
      summaryOn: 'Enabled',
      summaryOff: 'Off',
      summaryDuration: 'min ',
      summarySecond: 's',
      unavailable: 'This row is not configurable right now.',
      triggers: 'Triggers',
      enabled: 'Enable notifications',
      minDuration: 'Minimum duration for completions (seconds)',
      minDurationHint: 'Completed tasks shorter than this stay silent; failures and output-limit notices ignore it. Set 0 to notify every time.',
      notifyOnCompleted: 'Notify when a task completes',
      notifyOnError: 'Notify when a task fails or hits the output limit',
      notifyOnAborted: 'Also notify when a turn is aborted',
      notifyOnJobs: 'Notify when a background job settles',
      notifyOnSubagents: 'Also notify for subagent turns',
      display: 'Display and behavior',
      showPromptPreview: 'Show the task summary',
      showPromptPreviewHint: 'When off, the toast shows only the conversation name, status, and duration.',
      sound: 'Play a notification sound',
      soundKind: 'Sound style',
      soundKindHint: 'A Windows system event sound; applies while “Play a notification sound” is on.',
      soundDefault: 'System default',
      soundIm: 'IM',
      soundMail: 'Mail',
      soundReminder: 'Reminder',
      soundSms: 'SMS',
      imagePath: 'Toast artwork',
      imagePathHint: 'Empty keeps the bundled celebration image; a local absolute path or an http(s) image URL also works; use none to hide it. Invalid paths fall back to the bundled image.',
      iconPath: 'Header icon path (advanced)',
      iconPathHint: 'Icon in the toast header; applies only with a custom appId. Empty keeps the bundled whale icon.',
      language: 'Notification language',
      languageAuto: 'Follow system',
      languageZh: 'Chinese',
      languageEn: 'English',
      appName: 'App name above the toast',
      appNameHint: 'Displayed by Windows as the notification source.',
      clickUrl: 'Open this address when the toast is clicked',
      clickUrlHint: 'Defaults to dsh://open, which focuses or opens DeepSeek Harness; http/https also work.',
      save: 'Save',
      saving: 'Saving…',
      failed: 'The Host refused this change; the draft was kept.',
      savedNote: 'Saving applies immediately. The notification identity appId lives in cordis.patch.yml.',
    }

    const T = {
      border: '1px solid var(--dsw-alias-border-l1)',
      borderStrong: '1px solid var(--dsw-alias-border-l2)',
      label: 'var(--dsw-alias-label-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
      error: 'var(--dsw-alias-state-error-primary)',
      brand: 'var(--dsw-alias-brand-primary)',
      surface: 'var(--dsw-alias-bg-layer-1)',
      fieldBg: 'var(--dsw-alias-bg-layer-2)',
    }

    const control = {
      font: 'inherit',
      fontSize: 13,
      lineHeight: '20px',
      color: T.label,
      background: T.fieldBg,
      border: T.borderStrong,
      borderRadius: 8,
      padding: '7px 10px',
      width: '100%',
      boxSizing: 'border-box',
      outlineColor: T.brand,
    }

    function Field(props) {
      return h('label', { style: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 } },
        h('span', { style: { fontSize: 12, fontWeight: 600, color: T.label } }, props.label),
        props.children,
        props.hint ? h('span', { style: { fontSize: 12, lineHeight: '18px', color: T.muted } }, props.hint) : null,
      )
    }

    function Check(props) {
      return h('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: props.disabled ? 'not-allowed' : 'pointer' } },
        h('input', {
          type: 'checkbox',
          checked: props.checked === true,
          disabled: props.disabled,
          onChange: (event) => props.onChange(event.target.checked),
          style: { marginTop: 3, accentColor: T.brand },
        }),
        h('span', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
          h('span', { style: { fontSize: 13, color: T.label } }, props.label),
          props.hint ? h('span', { style: { fontSize: 12, lineHeight: '18px', color: T.muted } }, props.hint) : null,
        ),
      )
    }

    function secondsOf(value) {
      return Math.max(0, Math.round(Number(value === undefined ? 8000 : value) / 1000))
    }

    /** Translate function bound at apply time; props.t wins when the page provides one. */
    let translate = null

    function ConfigPage(props) {
      const { view, form } = props
      const t = typeof props.t === 'function' ? props.t : translate
      const state = form && form.state
      const value = state && state.value
      const revision = state && state.revision
      const [draft, setDraft] = React.useState(null)
      const [saving, setSaving] = React.useState(false)
      const [failed, setFailed] = React.useState(false)

      React.useEffect(() => {
        setDraft(value === undefined ? null : JSON.parse(JSON.stringify(value)))
        setFailed(false)
      }, [revision])

      if (view === 'summary') {
        const enabled = value === undefined || value.enabled !== false
        const seconds = secondsOf(value === undefined ? undefined : value.minDurationMs)
        return h('span', { style: { color: T.muted, fontSize: 13 } },
          enabled ? t('summaryOn') + ' · ' + t('summaryDuration') + seconds + t('summarySecond') : t('summaryOff'))
      }
      if (form === undefined || state === undefined || draft === null) {
        return h('p', { style: { margin: 0, color: T.muted } }, t('unavailable'))
      }

      const writable = state.writable !== false
      const patch = (key, next) => setDraft((current) => ({ ...current, [key]: next }))
      const seconds = secondsOf(draft.minDurationMs)
      const language = draft.language === 'zh' || draft.language === 'en' ? draft.language : 'auto'
      const soundKind = ['default', 'im', 'mail', 'reminder', 'sms'].includes(draft.soundKind) ? draft.soundKind : 'default'

      const save = async () => {
        const fields = [
          'enabled',
          'minDurationMs',
          'notifyOnCompleted',
          'notifyOnError',
          'notifyOnAborted',
          'notifyOnJobs',
          'notifyOnSubagents',
          'showPromptPreview',
          'sound',
          'soundKind',
          'language',
          'appName',
          'clickUrl',
          'imagePath',
          'iconPath',
        ]
        const base = value === undefined ? {} : value
        const ops = []
        for (const key of fields) {
          const next = draft[key]
          const before = base[key]
          if (next === undefined || next === before) continue
          ops.push({ op: 'set', path: [key], value: next })
        }
        if (ops.length === 0) return
        setSaving(true)
        try {
          const accepted = await form.mutate(ops, state.revision)
          setFailed(!accepted)
        } catch {
          setFailed(true)
        } finally {
          setSaving(false)
        }
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, color: T.label } },
        h('p', { style: { margin: 0, fontSize: 13, lineHeight: '20px', color: T.muted } }, t('hint')),

        h('section', {
          style: { border: T.border, borderRadius: 12, background: T.surface, padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
        },
          h('strong', { style: { fontSize: 14, fontWeight: 600 } }, t('triggers')),
          Check({
            checked: draft.enabled !== false,
            disabled: !writable,
            label: t('enabled'),
            onChange: (checked) => patch('enabled', checked),
          }),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 } },
            Field({ label: t('minDuration'), hint: t('minDurationHint') },
              h('input', {
                type: 'number',
                min: 0,
                step: 1,
                value: String(seconds),
                disabled: !writable,
                style: control,
                onChange: (event) => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next) && next >= 0) patch('minDurationMs', Math.min(86400000, Math.round(next * 1000)))
                },
              })),
            Field({ label: t('language') },
              h('select', {
                value: language,
                disabled: !writable,
                style: control,
                onChange: (event) => patch('language', event.target.value),
              },
                h('option', { value: 'auto' }, t('languageAuto')),
                h('option', { value: 'zh' }, t('languageZh')),
                h('option', { value: 'en' }, t('languageEn')),
              )),
          ),
          Check({
            checked: draft.notifyOnCompleted !== false,
            disabled: !writable,
            label: t('notifyOnCompleted'),
            onChange: (checked) => patch('notifyOnCompleted', checked),
          }),
          Check({
            checked: draft.notifyOnError !== false,
            disabled: !writable,
            label: t('notifyOnError'),
            onChange: (checked) => patch('notifyOnError', checked),
          }),
          Check({
            checked: draft.notifyOnAborted === true,
            disabled: !writable,
            label: t('notifyOnAborted'),
            onChange: (checked) => patch('notifyOnAborted', checked),
          }),
          Check({
            checked: draft.notifyOnJobs !== false,
            disabled: !writable,
            label: t('notifyOnJobs'),
            onChange: (checked) => patch('notifyOnJobs', checked),
          }),
          Check({
            checked: draft.notifyOnSubagents === true,
            disabled: !writable,
            label: t('notifyOnSubagents'),
            onChange: (checked) => patch('notifyOnSubagents', checked),
          }),
        ),

        h('section', {
          style: { border: T.border, borderRadius: 12, background: T.surface, padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
        },
          h('strong', { style: { fontSize: 14, fontWeight: 600 } }, t('display')),
          Check({
            checked: draft.showPromptPreview !== false,
            disabled: !writable,
            label: t('showPromptPreview'),
            hint: t('showPromptPreviewHint'),
            onChange: (checked) => patch('showPromptPreview', checked),
          }),
          Check({
            checked: draft.sound !== false,
            disabled: !writable,
            label: t('sound'),
            onChange: (checked) => patch('sound', checked),
          }),
          Field({ label: t('soundKind'), hint: t('soundKindHint') },
            h('select', {
              value: soundKind,
              disabled: !writable,
              style: control,
              onChange: (event) => patch('soundKind', event.target.value),
            },
              h('option', { value: 'default' }, t('soundDefault')),
              h('option', { value: 'im' }, t('soundIm')),
              h('option', { value: 'mail' }, t('soundMail')),
              h('option', { value: 'reminder' }, t('soundReminder')),
              h('option', { value: 'sms' }, t('soundSms')),
            )),
          Field({ label: t('imagePath'), hint: t('imagePathHint') },
            h('input', {
              type: 'text',
              value: typeof draft.imagePath === 'string' ? draft.imagePath : '',
              disabled: !writable,
              placeholder: 'C:\\pictures\\celebrate.png',
              spellCheck: false,
              style: control,
              onChange: (event) => patch('imagePath', event.target.value),
            })),
          Field({ label: t('iconPath'), hint: t('iconPathHint') },
            h('input', {
              type: 'text',
              value: typeof draft.iconPath === 'string' ? draft.iconPath : '',
              disabled: !writable,
              placeholder: 'C:\\pictures\\app-icon.png',
              spellCheck: false,
              style: control,
              onChange: (event) => patch('iconPath', event.target.value),
            })),
          Field({ label: t('appName'), hint: t('appNameHint') },
            h('input', {
              type: 'text',
              value: typeof draft.appName === 'string' ? draft.appName : '',
              disabled: !writable,
              style: control,
              onChange: (event) => patch('appName', event.target.value),
            })),
          Field({ label: t('clickUrl'), hint: t('clickUrlHint') },
            h('input', {
              type: 'url',
              value: typeof draft.clickUrl === 'string' ? draft.clickUrl : '',
              disabled: !writable,
              placeholder: 'dsh://open',
              style: control,
              onChange: (event) => patch('clickUrl', event.target.value),
            })),
        ),

        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
          h('button', {
            type: 'button',
            onClick: save,
            disabled: !writable || saving,
            style: {
              font: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              color: T.brand,
              background: 'transparent',
              border: '1px solid ' + T.brand,
              borderRadius: 8,
              padding: '7px 16px',
              cursor: !writable || saving ? 'not-allowed' : 'pointer',
            },
          }, saving ? t('saving') : t('save')),
          failed ? h('span', { style: { fontSize: 12, color: T.error } }, t('failed')) : null,
          h('span', { style: { fontSize: 12, color: T.muted } }, t('savedNote')),
        ),
      )
    }

    const inject = ['slots', 'locale']

    function apply(ctx) {
      translate = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'windows-notify: labels')
      ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: 'dsh-windows-notify#windows-notify',
      }, ConfigPage)), 'windows-notify: config page')
    }

    return { inject, apply }
  },
})
