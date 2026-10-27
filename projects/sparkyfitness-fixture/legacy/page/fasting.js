import { t } from '../lib/i18n'
import { loadToday, saveToday, push } from '../utils/queue'
import { theme } from '../utils/theme'

const hm = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
const ARC = { x: 90, y: 30, w: 300, h: 300, start_angle: -90, end_angle: 270, line_width: 24 }

Page({
  build() {
    if (typeof hmUI !== 'undefined' && hmUI.setLayerScrolling) {
      hmUI.setLayerScrolling(true)
    }
    const T = loadToday()
    const text = (p) =>
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 40,
        w: 400,
        h: 50,
        text_size: 24,
        color: theme.text,
        align_h: hmUI.align.CENTER_H,
        text_style: hmUI.text_style.WRAP,
        ...p
      })
    if (!T) return text({ y: 180, h: 120, color: theme.muted, text: t('dash.syncToDownload') })
    hmUI.createWidget(hmUI.widget.IMG, { x: 224, y: 96, src: 'icons/timer-outline.png' })
    const f = T.fasting
    const prefs = T.fastingPrefs
    if (f) {
      const start = Date.parse(f.start_time)
      const end = Date.parse(f.target_end_time)
      const now = Date.now()
      const pct = Math.min(100, Math.round(((now - start) / (end - start)) * 100))
      hmUI.createWidget(hmUI.widget.ARC, { ...ARC, color: theme.track })
      hmUI.createWidget(hmUI.widget.ARC_PROGRESS, {
        ...ARC,
        level: pct,
        color: pct >= 100 ? theme.success : theme.accent
      })
      const elapsed = text({ y: 140, text: hm(now - start), text_size: 52 })
      const remain = text({ y: 210, text: `${t('fast.remaining')} ${hm(end - now)}`, color: theme.muted })
      this.timer = setInterval(() => {
        const at = Date.now()
        elapsed.setProperty(hmUI.prop.TEXT, hm(at - start))
        remain.setProperty(hmUI.prop.TEXT, `${t('fast.remaining')} ${hm(end - at)}`)
      }, 60000)
    } else {
      this.protocolTxt = text({
        y: 150,
        text: prefs ? `${t('fast.protocol')} ${prefs.fasting_type} (${prefs.hours || 16}h)` : t('fast.noPrefs'),
        color: theme.muted
      })
    }
    if (!f && !prefs) return
    if (typeof hmApp !== 'undefined') {
      hmApp.registerSpinEvent?.((key, degree) => {
        if (!f && prefs) {
          const step = degree > 0 ? 1 : -1
          prefs.hours = Math.max(1, Math.min(48, (Number(prefs.hours) || 16) + step))
          if (this.protocolTxt) {
            this.protocolTxt.setProperty(hmUI.prop.TEXT, `${t('fast.protocol')} ${prefs.fasting_type} (${prefs.hours}h)`)
          }
        }
      })
    }
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 90,
      y: 360,
      w: 300,
      h: 64,
      radius: theme.radius,
      text_size: 26,
      text: t(f ? 'fast.end' : 'fast.start'),
      color: theme.text,
      normal_color: f ? theme.danger : theme.accent,
      press_color: theme.track,
      click_func: () => {
        if (f) {
          push('fast_end', {})
          T.fasting = null
        } else {
          const hours = Number(prefs.hours) || 16
          const target = new Date(Date.now() + hours * 3600e3).toISOString()
          push('fast_start', { fasting_type: prefs.fasting_type, target_end_time: target })
          T.fasting = {
            start_time: new Date().toISOString(),
            target_end_time: target,
            fasting_type: prefs.fasting_type,
            status: 'active'
          }
        }
        saveToday(T)
        hmUI.showToast({ text: t('list.registered') })
        hmApp.reloadPage({ url: 'page/fasting' })
      }
    })
  },
  onDestroy() {
    if (this.timer) clearInterval(this.timer)
    if (typeof hmApp !== 'undefined') {
      hmApp.unregisterSpinEvent?.()
    }
  }
})
