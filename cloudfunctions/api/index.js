// 云函数 api —— 门店会员系统统一后端入口
// 路由格式：event.action = "模块.方法"，如 "records.consume"
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const modules = {
  auth: require('./modules/auth'),
  members: require('./modules/members'),
  cards: require('./modules/cards'),
  records: require('./modules/records'),
  appointments: require('./modules/appointments'),
  services: require('./modules/services'),
  lottery: require('./modules/lottery'),
  payroll: require('./modules/payroll'),
  finance: require('./modules/finance'),
  misc: require('./modules/misc')
}

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const action = String(event.action || '')
    const dot = action.indexOf('.')
    const ns = dot > -1 ? action.slice(0, dot) : ''
    const fn = dot > -1 ? action.slice(dot + 1) : ''
    const mod = modules[ns]
    if (!mod || !fn || typeof mod[fn] !== 'function') {
      return { code: 404, message: '未知接口：' + action }
    }
    const ctx = { cloud, db: cloud.database(), OPENID, event }
    const data = await mod[fn](ctx, event)
    return { code: 0, data: data === undefined ? null : data }
  } catch (e) {
    console.error('[api]', event.action, e)
    return { code: 1, message: e.errMsg || e.message || '服务异常，请稍后再试' }
  }
}
