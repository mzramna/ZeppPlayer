import { readFileSync, writeFileSync } from '../shared/fs'

export function saveConfig(cfg) {
  if (!cfg) return
  try {
    if (typeof hmFS !== 'undefined' && hmFS.SysProSetChars) {
      hmFS.SysProSetChars('config', JSON.stringify(cfg))
    } else if (typeof hmFS !== 'undefined') {
      writeFileSync('config.json', JSON.stringify(cfg))
    }
  } catch (e) {}
}

export function loadConfig() {
  try {
    if (typeof hmFS !== 'undefined' && hmFS.SysProGetChars) {
      return JSON.parse(hmFS.SysProGetChars('config') || '{}') || {}
    } else if (typeof hmFS !== 'undefined') {
      const raw = readFileSync('config.json')
      return raw ? JSON.parse(raw) : {}
    }
  } catch (e) {
    return {}
  }
  return {}
}

export function canDirectSync() {
  if (typeof globalThis.fetch !== 'function') return false
  const cfg = loadConfig()
  return !!(cfg && cfg.server && cfg.apiKey)
}
