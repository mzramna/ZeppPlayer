import { MessageBuilder } from '../shared/message'
import { fetchToday, sendEntry } from './api'

const messageBuilder = new MessageBuilder()

function getSetting(key) {
  if (typeof settings !== 'undefined' && settings.settingsStorage) {
    return settings.settingsStorage.getItem(key)
  }
  if (typeof settingsStorage !== 'undefined') {
    return settingsStorage.getItem(key)
  }
  return null
}

AppSideService({
  onInit() {
    messageBuilder.listen(() => {})
    messageBuilder.on('request', async (ctx) => {
      try {
        const payload = messageBuilder.buf2Json(ctx.request.payload)
        const sensorMode = getSetting('sensorMode') || 'health-connect'
        const config = {
          server: getSetting('server') || '',
          apiKey: getSetting('apiKey') || '',
          sensorMode
        }
        if (payload.method === 'sync') {
          const synced = []
          for (const e of (payload.params && payload.params.entries) || []) {
            if (e.type !== 'health' || sensorMode === 'direct') await sendEntry(e)
            synced.push(e.id)
          }
          const today = await fetchToday()
          today.sensorMode = sensorMode
          ctx.response({ data: { synced, today, sensorMode, config } })
        } else {
          ctx.response({ data: { error: 'método inválido', config } })
        }
      } catch (err) {
        const sensorMode = getSetting('sensorMode') || 'health-connect'
        const config = {
          server: getSetting('server') || '',
          apiKey: getSetting('apiKey') || '',
          sensorMode
        }
        ctx.response({ data: { error: err.message, config } })
      }
    })
  },
  onRun() {},
  onDestroy() {}
})
