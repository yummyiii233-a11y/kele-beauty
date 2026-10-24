// 消费 / 扣卡 / 充值登记与记录查询
const U = require('../_utils')

const PAY_NAMES = { wechat: '微信', cash: '现金', card: '刷卡', balance: '储值', count: '次卡' }

function ensureTicket(ctx, memberId, recordId, amountFen) {
  const min = U.DEFAULTS.LOTTERY_MIN_FEN
  if (min > 0 && amountFen < min) return null
  return ctx.db.collection('lottery_tickets').add({
    data: { memberId: memberId, recordId: recordId, used: false, createdAt: U.now() }
  })
}

// 消费登记：payType = balance 储值扣款 | count 次卡扣次 | cash 现场收款
async function consume(ctx, event) {
  const staff = await U.requireStaff(ctx)
  const payType = String(event.payType)
  const serviceName = String(event.serviceName || '').trim()
  const amount = U.toFen(event.amount || 0)
  const count = parseInt(event.count, 10) || 1
  if (!serviceName) throw new Error('请填写消费项目')
  if (payType === 'balance' && amount <= 0) throw new Error('请填写消费金额')
  if (payType === 'cash' && amount <= 0) throw new Error('请填写收款金额')
  if (payType === 'count' && !event.cardId) throw new Error('请选择次卡')
  if (!['balance', 'count', 'cash'].includes(payType)) throw new Error('无效支付方式')

  let ticketRef = null
  await ctx.db.runTransaction(async t => {
    const doc = {
      kind: payType === 'count' ? 'deduct' : 'consume',
      memberId: event.memberId,
      payType: payType,
      payName: PAY_NAMES[payType],
      serviceName: serviceName,
      amount: payType === 'count' ? 0 : amount,   // 实际金额（分）
      cardId: event.cardId || '',
      count: payType === 'count' ? count : 0,
      payMethod: payType === 'cash' ? (event.payMethod || 'cash') : '',
      staffId: staff._id,
      staffName: staff.nickName || '店员',
      remark: String(event.remark || '').slice(0, 200),
      createdAt: U.now()
    }
    const addRes = await t.collection('records').add({ data: doc })
    doc._id = addRes._id

    if (payType === 'balance') {
      const mRef = t.collection('members').doc(event.memberId)
      const mRes = await mRef.get()
      const balance = mRes.data.balance || 0
      if (balance < amount) throw new Error('储值余额不足，请先充值')
      await mRef.update({ data: { balance: balance - amount, spendTotal: (mRes.data.spendTotal || 0) + amount } })
    } else if (payType === 'count') {
      const cRef = t.collection('cards').doc(event.cardId)
      const cRes = await cRef.get()
      const card = cRes.data
      if (!card) throw new Error('次卡不存在')
      if (card.status !== 'active') throw new Error('次卡不可用')
      if (U.ymd(U.now()) > card.endDate) throw new Error('次卡已过有效期')
      const used = (card.usedCount || 0) + count
      if (used > card.totalCount) throw new Error('次卡剩余次数不足')
      await cRef.update({
        data: { usedCount: used, remainCount: card.totalCount - used, status: used >= card.totalCount ? 'done' : 'active' }
      })
    } else {
      const mRef = t.collection('members').doc(event.memberId)
      const mRes = await mRef.get()
      await mRef.update({ data: { spendTotal: (mRes.data.spendTotal || 0) + amount } })
    }
    ticketRef = await ensureTicket(ctx, event.memberId, doc._id, payType === 'count' ? 1 : amount)
  })
  return { hasTicket: !!ticketRef }
}

// 充值登记
async function recharge(ctx, event) {
  const staff = await U.requireStaff(ctx)
  const amount = U.toFen(event.amount)
  const give = U.toFen(event.give || 0)
  if (amount <= 0) throw new Error('请填写充值金额')
  const payMethod = ['wechat', 'cash', 'card'].includes(event.payMethod) ? event.payMethod : 'wechat'
  await ctx.db.runTransaction(async t => {
    const doc = {
      kind: 'recharge',
      memberId: event.memberId,
      amount: amount,
      give: give,
      total: amount + give,
      payMethod: payMethod,
      payName: PAY_NAMES[payMethod],
      staffId: staff._id,
      staffName: staff.nickName || '店员',
      remark: String(event.remark || '').slice(0, 200),
      createdAt: U.now()
    }
    const addRes = await t.collection('records').add({ data: doc })
    doc._id = addRes._id
    const mRef = t.collection('members').doc(event.memberId)
    const mRes = await mRef.get()
    await mRef.update({ data: { balance: (mRes.data.balance || 0) + amount + give } })
    await ensureTicket(ctx, event.memberId, doc._id, amount)
  })
  return { ok: true }
}

// 记录查询：kind = consume | deduct | recharge；不传 memberId 时查自己
async function list(ctx, event) {
  const me = await U.requireMember(ctx)
  const targetId = event.memberId || me._id
  if (targetId !== me._id && !U.isStaff(me)) throw new Error('无权限')
  const p = U.pager(event, { pageSize: 20 })
  let where = { memberId: targetId }
  if (event.kind) where.kind = String(event.kind)
  const coll = ctx.db.collection('records')
  const [listRes, countRes] = await Promise.all([
    coll.where(where).orderBy('createdAt', 'desc').skip(p.skip).limit(p.pageSize).get(),
    coll.where(where).count()
  ])
  return { list: listRes.data, total: countRes.total, page: p.page, pageSize: p.pageSize }
}

// 今日经营概览（店员端工作台）
async function stats(ctx) {
  await U.requireStaff(ctx)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const _ = ctx.db.command
  const todayWhere = { createdAt: _.gte(start) }
  const [consumeRes, rechargeRes, apptRes, memberRes] = await Promise.all([
    ctx.db.collection('records').where(Object.assign({ kind: _.in(['consume', 'deduct']) }, todayWhere)).count(),
    ctx.db.collection('records').where(Object.assign({ kind: 'recharge' }, todayWhere)).count(),
    ctx.db.collection('appointments').where({ date: U.ymd(U.now()) }).count(),
    ctx.db.collection('members').count()
  ])
  return {
    todayConsume: consumeRes.total,
    todayRecharge: rechargeRes.total,
    todayAppointments: apptRes.total,
    members: memberRes.total
  }
}

module.exports = { consume: consume, recharge: recharge, list: list, stats: stats }
