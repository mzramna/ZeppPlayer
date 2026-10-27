import * as hmUI from '@zos/ui'
import { push as navigate, replace } from '@zos/router'
import { showToast, onDigitalCrown, offDigitalCrown, onGesture, offGesture, GESTURE_LEFT, GESTURE_RIGHT } from '@zos/interaction'
import { getText as t } from '@zos/i18n'
import { BasePage } from '@zeppos/zml/base-page'
import { loadToday, saveToday, push, addWater } from '../utils/queue'
import { scheduleReminders } from '../utils/reminders'
import { hhmm } from '../utils/time'
import { theme } from '../utils/theme'
const go = (key, extra) => () => navigate({ url: 'page/list', params: JSON.stringify({ key, ...extra }) })
const dose = (d) => (d.dose_amount ? `${d.dose_amount}${d.dose_unit || ''}` : '')
const waterTotal = () => { const w = loadToday().water; return `${w.ml} / ${w.goal_ml} ml` }
// Marca a dose como feita no cache: a lista reconstruída mostra ✓ e não aceita novo toque.
const markDone = (d) => {
  const T = loadToday()
  if (!T) return
  T.doses.forEach((x) => { if (x.medication_id === d.medication_id && x.schedule_id === d.schedule_id && x.scheduled_for === d.scheduled_for) x.done = true })
  saveToday(T)
  try { scheduleReminders(T.doses) } catch (e) {}
}

const TABS = ['water', 'meds', 'cycle', 'mood', 'symptom', 'food']
const PAGE_SIZE = 5

// rows(T, page) -> [{ text, color?, pick? }]; pick devolve o tamanho da fila quando registra algo.
// leaf: depois de registrar, recarrega a lista pai (key) com o cache atualizado.
const SCREENS = {
  water: { icon: 'icons/water.png', head: waterTotal, rows: (T) => T.containers.flatMap((c) => [1, -1].map((ch) => (
    { text: `${ch > 0 ? '+' : '−'} ${c.name} ${c.volume}${c.unit}`, pick: () => addWater(c, ch) }))) },
  meds: { icon: 'icons/medkit-outline.png', rows: (T) => [
    ...T.doses.map((d) => ({ text: `${d.done ? '✓ ' : ''}${hhmm(d.scheduled_for)} ${d.label}`,
      color: d.done ? theme.muted : theme.text, pick: d.done ? undefined : go('dose', { dose: d }) })),
    ...(T.medications.length ? [{ text: t('list.prn'), color: theme.muted }] : []),
    ...T.medications.map((m) => ({ text: `${m.name} ${dose(m)}`.trim(),
      pick: () => push('meds', { medication_id: m.id, status: 'prn_taken', dose_amount: m.dose_amount, dose_unit: m.dose_unit }) }))
  ] },
  dose: { icon: 'icons/medkit-outline.png', leaf: 'meds', rows: (T, p) => ['taken', 'skipped'].map((status) => ({ text: t(`list.${status}`),
    pick: () => {
      const d = p.params.dose
      const n = push('meds', { medication_id: d.medication_id, status, schedule_id: d.schedule_id,
        scheduled_for: d.scheduled_for, dose_amount: d.dose_amount, dose_unit: d.dose_unit })
      markDone(d)
      return n
    } })) },
  cycle: { icon: 'icons/leaf-outline.png', rows: (T) => T.flowLevels.map((f) => ({ text: t(`flow.${f}`), pick: () => push('cycle', { flow_level: f }) })) },
  mood: { icon: 'icons/happy-outline.png', rows: () => [1, 2, 3, 4, 5].map((v) => ({ text: t(`mood.${v}`), pick: () => push('mood', { mood_value: v }) })) },
  symptom: { icon: 'icons/medkit-outline.png', rows: (T) => T.symptoms.map((s) => ({ text: s.name, pick: () => push('symptom', { symptom_id: s.id, name: s.name }) })) },
  food: { icon: 'icons/restaurant.png', rows: (T) => T.foods.map((f) => ({ text: f.name, pick: go('meal', { food: f }) })) },
  meal: { icon: 'icons/restaurant.png', leaf: 'food', rows: (T, p) => T.mealTypes.map((m) => ({ text: m.name, pick: () => push('food', { ...p.params.food, meal_type_id: m.id }) })) }
}

Page(BasePage({
  onInit(p) {
    this.params = JSON.parse(p || '{}')
    this.page = Number(this.params.page) || 0
  },
  build() {
    const s = SCREENS[this.params.key]
    const T = loadToday()
    const c = hmUI.createWidget(hmUI.widget.VIEW_CONTAINER, { x: 0, y: 0, w: 480, h: 480, scroll_enable: 1 })
    const text = (y, p) => c.createWidget(hmUI.widget.TEXT, { x: 40, y, w: 400, h: 50, text_size: 30, color: theme.text,
      align_h: hmUI.align.CENTER_H, ...p })
    // Ícone centralizado acima do título; no círculo da tela o topo é estreito, então fica bem junto da borda.
    if (s) c.createWidget(hmUI.widget.IMG, { x: 220, y: 4, src: s.icon })
    text(44, { text: t(`list.${this.params.key}`), text_size: 32 })
    const allRows = T && s ? s.rows(T, this) : []
    if (!allRows.length) {
      text(180, { h: 120, text_size: 24, color: theme.muted, text_style: hmUI.text_style.WRAP,
        text: t(T ? 'list.empty' : 'dash.syncToDownload') })
      this.initInteractions(1)
      return
    }

    const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE))
    if (this.page >= totalPages) this.page = totalPages - 1
    const pagedRows = allRows.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE)

    let y = 100
    if (s.head) { this.head = text(y, { text: s.head(), color: theme.water }); y += 50 }

    if (totalPages > 1 || TABS.includes(this.params.key)) {
      const tabIdx = TABS.indexOf(this.params.key)
      const pageInfo = totalPages > 1 ? `${this.page + 1}/${totalPages}` : `${tabIdx + 1}/${TABS.length}`
      c.createWidget(hmUI.widget.BUTTON, { x: 50, y, w: 70, h: 40, radius: 20, text: '◀', text_size: 22,
        color: theme.muted, normal_color: theme.card, press_color: theme.track,
        click_func: () => this.prevPage(totalPages) })
      text(y + 4, { x: 120, w: 240, h: 32, text_size: 20, color: theme.muted, text: pageInfo })
      c.createWidget(hmUI.widget.BUTTON, { x: 360, y, w: 70, h: 40, radius: 20, text: '▶', text_size: 22,
        color: theme.muted, normal_color: theme.card, press_color: theme.track,
        click_func: () => this.nextPage(totalPages) })
      y += 50
    }

    pagedRows.forEach((r) => {
      c.createWidget(hmUI.widget.BUTTON, { x: 50, y, w: 380, h: 62, radius: theme.radius, text: r.text, text_size: 24,
        color: r.color || theme.text, normal_color: theme.card, press_color: theme.track,
        click_func: () => {
          const n = r.pick && r.pick()
          if (typeof n !== 'number') return
          showToast({ content: `${t('list.registered')} (${n})` })
          if (this.head) this.head.setProperty(hmUI.prop.TEXT, s.head())
          if (s.leaf) replace({ url: 'page/list', params: JSON.stringify({ key: s.leaf }) })
        } })
      y += 72
    })

    this.initInteractions(totalPages)
  },
  prevPage(totalPages) {
    if (this.page > 0) {
      replace({ url: 'page/list', params: JSON.stringify({ ...this.params, page: this.page - 1 }) })
    } else {
      const idx = TABS.indexOf(this.params.key)
      if (idx > 0) {
        replace({ url: 'page/list', params: JSON.stringify({ key: TABS[idx - 1], page: 0 }) })
      } else if (idx === 0) {
        replace({ url: 'page/list', params: JSON.stringify({ key: TABS[TABS.length - 1], page: 0 }) })
      }
    }
  },
  nextPage(totalPages) {
    if (this.page < totalPages - 1) {
      replace({ url: 'page/list', params: JSON.stringify({ ...this.params, page: this.page + 1 }) })
    } else {
      const idx = TABS.indexOf(this.params.key)
      if (idx >= 0) {
        replace({ url: 'page/list', params: JSON.stringify({ key: TABS[(idx + 1) % TABS.length], page: 0 }) })
      }
    }
  },
  initInteractions(totalPages) {
    onGesture?.({
      callback: (event) => {
        if (event === GESTURE_LEFT) { this.nextPage(totalPages); return true }
        if (event === GESTURE_RIGHT) { this.prevPage(totalPages); return true }
        return false
      }
    })
    onDigitalCrown?.({
      callback: (key, degree) => {
        if (degree > 0 && this.page < totalPages - 1) this.nextPage(totalPages)
        else if (degree < 0 && this.page > 0) this.prevPage(totalPages)
      }
    })
  },
  onDestroy() {
    offGesture?.()
    offDigitalCrown?.()
  }
}))
