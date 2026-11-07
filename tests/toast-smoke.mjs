import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildToastXml, sendWindowsToast } from '../notify.js'

const iconFile = fileURLToPath(new URL('../assets/dsh-whale.png', import.meta.url))
const imageFile = fileURLToPath(new URL('../assets/celebrate.png', import.meta.url))
const iconUri = pathToFileURL(iconFile).href
const imageUri = pathToFileURL(imageFile).href

const xml = buildToastXml({
  title: '登录修复',
  body: '已修复 token 刷新逻辑，并补充了回归测试',
  footer: '任务完成 · dsh · 12 秒 · 点击打开 Harness',
  silent: false,
  clickUrl: 'dsh://open',
  appLogo: iconUri,
  image: imageUri,
})
console.log(xml)
const result = await sendWindowsToast({
  appId: 'DeepSeekHarness.Notify',
  appName: 'DeepSeek Harness',
  iconPath: iconUri,
  xml,
})
console.log(JSON.stringify(result))
