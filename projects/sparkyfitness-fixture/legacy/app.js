import './shared/device-polyfill'
import { messageBuilder } from './utils/message'

const appId = 1099001

if (typeof hmUI !== 'undefined' && hmUI.setStatusBarVisible) {
  hmUI.setStatusBarVisible(false)
}

App({
  globalData: {
    messageBuilder,
    appId
  },
  onCreate() {
    messageBuilder.connect()
  },
  onDestroy() {
    messageBuilder.disConnect()
  }
})
