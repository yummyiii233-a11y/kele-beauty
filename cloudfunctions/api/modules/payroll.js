// 员工工资：底薪 + 按单提成；老板生成工资条并确认锁定，员工查看自己的工资记录
const U = require('../_utils')

// 'YYYY-MM' → [起始Date, 结束Date)（本地时区）
function monthRange(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''))
  if (!m) throw new Error('无效月份')
  const y = Number(m[1]), mo = Number(m[2])
  if (mo < 1 || mo > 12) throw new Error('无效月份')
  return [new Date(y, mo - 1, 1), new Date(y, mo, 1)]
}

function curMonth() {
  const d = U.now()
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return d.getFullYear() + '-' + p(d.getMonth() + 1)
}

// 薪酬配置：底薪（分/月）+ 提成比例（万分比，1000 = 10%）
async function setConfig(ctx, event) {
  await U.requireManager(ctx)
  const baseFen = U.toFen(event.baseFen)
  const rateBp = U.toFen(event.rateBp)
  if (baseFen < 0) throw new Error('底薪无效')
  if (rateBp < 0 || rateBp > 10000) throw new Error('提成比例需在 0-100% 之间')
  await ctx.db.collection('members').doc(event.memberId).update({
    data: { salaryBaseFen: baseFen, commissionRateBp: rateBp }
  })
  return { ok: true }
}

// 单个员工某月业绩与提成预估
async function staffMonthStat(ctx, month, staffId) {
  const _ = ctx.db.command
  const [start, end] = monthRange(month)
  const where = {
    staffId: staffId,
    kind: _.in(['consume', 'deduct']),
    createdAt: _.gte(start).and(_.lt(end))
  }
  const r = await ctx.db.collection('records').where(where).get()
  let amount = 0, count = r.data.length
  r.data.forEach(x => { amount += (x.amount || 0) })
  const mRes = await ctx.db.collection('members').doc(staffId).get()
  const m = mRes.data || {}
  const rateBp = m.commissionRateBp || 0
  const baseFen = m.salaryBaseFen || 0
  const commissionFen = Math.round(amount * rateBp / 10000)
  return {
    staffId: staffId,
    staffName: m.nickName || '员工',
    role: m.role || 'staff',
    baseFen: baseFen,
    rateBp: rateBp,
    orderCount: count,
    serviceAmount: amount,
    commissionFen: commissionFen
  }
}

// 老板：全员某月汇总（实时预估）
async function previewAll(ctx, event) {
  await U.requireManager(ctx)
  const month = String(event.month || curMonth()).slice(0, 7)
  const staffRes = await ctx.db.collection('members')
    .where({ role: ctx.db.command.in(['staff', 'manager']) }).get()
  const list = []
  for (const s of staffRes.data) {
    list.push(await staffMonthStat(ctx, month, s._id))
  }
  return { month: month, list: list }
}

// 老板：生成/更新某员工某月工资条（draft，可反复保存，确认前不锁定）
async function issue(ctx, event) {
  const me = await U.requireManager(ctx)
  const month = String(event.month || curMonth()).slice(0, 7)
  const stat = await staffMonthStat(ctx, month, event.memberId)
  const bonusFen = U.toFen(event.bonusFen || 0)
  const deductFen = U.toFen(event.deductFen || 0)
  const doc = {
    month: month,
    staffId: event.memberId,
    staffName: stat.staffName,
    baseFen: stat.baseFen,
    rateBp: stat.rateBp,
    orderCount: stat.orderCount,
    serviceAmount: stat.serviceAmount,
    commissionFen: U.toFen(event.commissionFen != null ? event.commissionFen : stat.commissionFen),
    bonusFen: bonusFen,
    deductFen: deductFen,
    note: String(event.note || '').slice(0, 200),
    status: 'draft',   // draft 待确认 / confirmed 已锁定
    createdBy: me._id,
    updatedAt: U.now()
  }
  doc.totalFen = doc.baseFen + doc.commissionFen + doc.bonusFen - doc.deductFen

  const dup = await ctx.db.collection('payrolls')
    .where({ month: month, staffId: event.memberId }).limit(1).get()
  if (dup.data.length) {
    if (dup.data[0].status === 'confirmed') throw new Error('该工资条已确认锁定，不可修改')
    await ctx.db.collection('payrolls').doc(dup.data[0]._id).update({ data: doc })
    return { id: dup.data[0]._id, totalFen: doc.totalFen }
  }
  const r = await ctx.db.collection('payrolls').add({ data: doc })
  return { id: r._id, totalFen: doc.totalFen }
}

// 老板：确认锁定
async function confirm(ctx, event) {
  await U.requireManager(ctx)
  await ctx.db.collection('payrolls').doc(event.id).update({
    data: { status: 'confirmed', confirmedAt: U.now() }
  })
  return { ok: true }
}

// 老板：删除 draft 工资条
async function remove(ctx, event) {
  await U.requireManager(ctx)
  const r = await ctx.db.collection('payrolls').doc(event.id).get()
  if (r.data.status === 'confirmed') throw new Error('已确认的工资条不可删除')
  await ctx.db.collection('payrolls').doc(event.id).remove()
  return { ok: true }
}

// 老板：某月全部工资条
async function list(ctx, event) {
  await U.requireManager(ctx)
  const month = String(event.month || curMonth()).slice(0, 7)
  const r = await ctx.db.collection('payrolls')
    .where({ month: month }).orderBy('updatedAt', 'desc').limit(100).get()
  return { month: month, list: r.data }
}

// 员工：我的工资记录 + 本月实时预估
async function mine(ctx) {
  const me = await U.requireStaff(ctx)
  const month = curMonth()
  const [myRes, stat] = await Promise.all([
    ctx.db.collection('payrolls').where({ staffId: me._id }).orderBy('month', 'desc').limit(24).get(),
    staffMonthStat(ctx, month, me._id)
  ])
  return { list: myRes.data, month: month, estimate: stat }
}

module.exports = {
  setConfig: setConfig,
  previewAll: previewAll,
  issue: issue,
  confirm: confirm,
  remove: remove,
  list: list,
  mine: mine
}
