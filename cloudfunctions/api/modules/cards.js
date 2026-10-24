// 次卡卡项
const U = require('../_utils')

async function list(ctx, event) {
  const me = await U.requireMember(ctx)
  const targetId = event.memberId || me._id
  if (targetId !== me._id && !U.isStaff(me)) throw new Error('无权限')
  const r = await ctx.db.collection('cards')
    .where({ memberId: targetId })
    .orderBy('createdAt', 'desc')
    .get()
  return { list: r.data }
}

// 开次卡（店员/店长）
async function create(ctx, event) {
  await U.requireStaff(ctx)
  const serviceName = String(event.serviceName || '').trim()
  if (!serviceName) throw new Error('请填写次卡项目')
  const totalCount = parseInt(event.totalCount, 10)
  if (!(totalCount > 0)) throw new Error('次卡次数需大于 0')
  const data = {
    memberId: event.memberId,
    serviceName: serviceName,
    serviceId: event.serviceId || '',
    totalCount: totalCount,
    usedCount: 0,
    remainCount: totalCount,
    price: U.toFen(event.price || 0),      // 购卡实付（分）
    startDate: event.startDate ? String(event.startDate).slice(0, 10) : U.ymd(U.now()),
    endDate: event.endDate ? String(event.endDate).slice(0, 10) : U.ymd(U.daysLater(365)),
    status: 'active',
    remark: String(event.remark || '').slice(0, 200),
    createdAt: U.now()
  }
  const r = await ctx.db.collection('cards').add({ data: data })
  return Object.assign({ _id: r._id }, data)
}

async function setStatus(ctx, event) {
  await U.requireStaff(ctx)
  const status = String(event.status)
  if (['active', 'frozen', 'invalid'].indexOf(status) < 0) throw new Error('无效状态')
  await ctx.db.collection('cards').doc(event.cardId).update({ data: { status: status } })
  return { ok: true }
}

module.exports = { list: list, create: create, setStatus: setStatus }
