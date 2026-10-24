// 云函数调用封装：所有后端能力统一走 api 云函数
const config = require('./config')

function call(action, data) {
  return wx.cloud.callFunction({
    name: 'api',
    data: Object.assign({ action: action }, data || {})
  }).then(res => {
    const r = res.result || {}
    if (r.code !== 0) {
      const err = new Error(r.message || '请求失败')
      err.code = r.code
      throw err
    }
    return r.data
  })
}

function toastError(e) {
  wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
}

module.exports = {
  call: call,
  toastError: toastError,
  env: config.CLOUD_ENV
}
