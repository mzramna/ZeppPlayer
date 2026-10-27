import { BaseSideService, settingsLib } from '@zeppos/zml/base-side'
import { fetchToday, sendEntry } from './api'

AppSideService(BaseSideService({
  async onRequest(req, res) {
    if (req.method !== 'sync') return res(null, { error: 'método inválido' })
    const synced = []
    const sensorMode = settingsLib.getItem('sensorMode') || 'health-connect'
    const config = {
      server: settingsLib.getItem('server') || '',
      apiKey: settingsLib.getItem('apiKey') || '',
      sensorMode
    }
    try {
      for (const e of (req.params && req.params.entries) || []) {
        // Fora do modo direto, 'health' fica no Health Connect: não envia, mas confirma o id para o relógio descartar.
        if (e.type !== 'health' || sensorMode === 'direct') await sendEntry(e)
        synced.push(e.id)
      }
      const today = await fetchToday()
      today.sensorMode = sensorMode
      res(null, { synced, today, sensorMode, config })
    } catch (err) {
      res(null, { synced, error: err.message, sensorMode, config })
    }
  }
}))
