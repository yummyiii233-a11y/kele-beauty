// 云函数公共工具：登录态、权限、分页、金额
const DEFAULTS = require('./defaults')

async function getMemberByOpenid(ctx) {
  const r = await ctx.db.collection('members').where({ _openid: ctx.OPENID }).limit(1).get()
  return r.data[0] || null
}

async function requireMember(ctx) {
  const m = await getMemberByOpenid(ctx)
  if (!m) throw new Error('请先在小程序中登录')
  return m
}

function isStaff(m) { return m && (m.role === 'staff' || m.role === 'manager') }
function isManager(m) { return m && m.role === 'manager' }

async function requireStaff(ctx) {
  const m = await requireMember(ctx)
  if (!isStaff(m)) throw new Error('仅店员/店长可操作')
  return m
}

async function requireManager(ctx) {
  const m = await requireMember(ctx)
  if (!isManager(m)) throw new Error('仅店长可操作')
  return m
}

// 分页查询封装
function pager(event, defaults) {
  const d = defaults || {}
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(50, Number(event.pageSize) || d.pageSize || 20)
  return { page: page, pageSize: pageSize, skip: (page - 1) * pageSize }
}

function now() { return new Date() }
function daysLater(n) { return new Date(Date.now() + n * 86400000) }
function ymd(d) {
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

// 金额一律以「分」为整数单位存储
function toFen(v) {
  const n = Number(v)
  return isNaN(n) ? 0 : Math.round(n)
}

module.exports = {
  getMemberByOpenid: getMemberByOpenid,
  requireMember: requireMember,
  requireStaff: requireStaff,
  requireManager: requireManager,
  isStaff: isStaff,
  isManager: isManager,
  pager: pager,
  now: now,
  daysLater: daysLater,
  ymd: ymd,
  toFen: toFen,
  DEFAULTS: DEFAULTS
}
