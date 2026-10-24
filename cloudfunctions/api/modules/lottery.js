// 翻牌抽奖：奖池管理 / 抽奖 / 我的奖品
const U = require('../_utils')
const D = require('../defaults')

const TYPE_LABEL = { coupon: '优惠券', service: '免费项目', gift: '专属福利', none: '谢谢参与' }

function normalizePrize(p) {
  return {
    _id: p._id,
    name: p.name,
    type: p.type,
    typeLabel: TYPE_LABEL[p.type] || '奖品',
    value: p.value || 0,
    serviceName: p.serviceName || '',
    remark: p.remark || '',
    validDays: p.validDays || 0
  }
}

// —— 奖池（店员可维护） ——
async function poolList(ctx, event) {
  const where = {}
  if (!event.all) where.enabled = true
  const r = await ctx.db.collection('prize_pool').where(where).orderBy('probability', 'desc').get()
  return { list: r.data }
}

async function poolUpsert(ctx, event) {
  await U.requireStaff(ctx)
  const name = String(event.name || '').trim()
  if (!name) throw new Error('请填写奖品名称')
  const probability = Number(event.probability)
  if (!(probability > 0)) throw new Error('中奖概率需大于 0')
  const data = {
    name: name,
    type: ['coupon', 'service', 'gift', 'none'].includes(event.type) ? event.type : 'coupon',
    value: U.toFen(event.value || 0),
    serviceName: String(event.serviceName || ''),
    remark: String(event.remark || '').slice(0, 200),
    validDays: parseInt(event.validDays, 10) || 30,
    probability: probability,        // 相对权重，页面上按百分比展示
    stock: parseInt(event.stock, 10) || 0,
    enabled: event.enabled === undefined ? true : !!event.enabled
  }
  if (event.id) {
    await ctx.db.collection('prize_pool').doc(event.id).update({ data: data })
    return Object.assign({ _id: event.id }, data)
  }
  data.createdAt = U.now()
  const r = await ctx.db.collection('prize_pool').add({ data: data })
  return Object.assign({ _id: r._id }, data)
}

async function poolToggle(ctx, event) {
  await U.requireStaff(ctx)
  await ctx.db.collection('prize_pool').doc(event.id).update({ data: { enabled: !!event.enabled } })
  return { ok: true }
}

async function poolRemove(ctx, event) {
  await U.requireStaff(ctx)
  await ctx.db.collection('prize_pool').doc(event.id).remove()
  return { ok: true }
}

// —— 抽奖 ——
// status: 是否有待开奖机会
async function status(ctx) {
  const me = await U.requireMember(ctx)
  const r = await ctx.db.collection('lottery_tickets')
    .where({ memberId: me._id, used: false }).count()
  return { hasTicket: r.total > 0 }
}

// 翻牌开奖：按奖池权重随机，写入我的奖品
async function draw(ctx, event) {
  const me = await U.requireMember(ctx)
  const ticketRes = await ctx.db.collection('lottery_tickets')
    .where({ memberId: me._id, used: false }).orderBy('createdAt', 'asc').limit(1).get()
  const ticket = ticketRes.data[0]
  if (!ticket) throw new Error('暂无可用的抽奖机会')

  const poolRes = await ctx.db.collection('prize_pool')
    .where({ enabled: true, stock: ctx.db.command.gt(0) }).get()
  const pool = poolRes.data
  let prize = null
  if (pool.length > 0) {
    const totalWeight = pool.reduce((s, p) => s + (Number(p.probability) || 0), 0)
    let rnd = Math.random() * totalWeight
    for (let i = 0; i < pool.length; i++) {
      rnd -= Number(pool[i].probability) || 0
      if (rnd <= 0) { prize = pool[i]; break }
    }
    if (!prize) prize = pool[pool.length - 1]
  }

  let saved = null
  if (prize && prize.type !== 'none') {
    const doc = {
      memberId: me._id,
      prizeId: prize._id,
      name: prize.name,
      type: prize.type,
      value: prize.value || 0,
      serviceName: prize.serviceName || '',
      remark: prize.remark || '',
      status: 'unused',                 // unused 未使用 / used 已核销 / expired 已过期
      obtainedAt: U.now(),              // 抽奖时间
      expireAt: U.daysLater(prize.validDays || 30),
      usedAt: null,
      usedBy: ''
    }
    const addRes = await ctx.db.collection('prizes').add({ data: doc })
    saved = Object.assign({ _id: addRes._id }, doc)
  }

  const batch = [
    ctx.db.collection('lottery_tickets').doc(ticket._id).update({
      data: { used: true, usedAt: U.now(), prizeId: prize ? prize._id : '', prizeName: prize ? prize.name : '谢谢参与' }
    })
  ]
  if (prize && prize.type !== 'none' && prize.stock < 100000) {
    batch.push(
      ctx.db.collection('prize_pool').doc(prize._id).update({ data: { stock: ctx.db.command.inc(-1) } })
    )
  }
  await Promise.all(batch)

  return {
    prize: saved ? normalizePrize(saved) : null,
    name: prize ? prize.name : '谢谢参与',
    typeLabel: prize ? TYPE_LABEL[prize.type] : ''
  }
}

// —— 我的奖品 ——
async function mine(ctx) {
  const me = await U.requireMember(ctx)
  const coll = ctx.db.collection('prizes')
  const _ = ctx.db.command
  // 过期奖品自动标记
  try {
    await coll.where({ memberId: me._id, status: 'unused', expireAt: _.lt(U.now()) })
      .update({ data: { status: 'expired' } })
  } catch (e) { /* 忽略 */ }
  const r = await coll.where({ memberId: me._id }).orderBy('obtainedAt', 'desc').limit(100).get()
  // 抽奖历史（含未中奖）
  const logRes = await ctx.db.collection('lottery_tickets')
    .where({ memberId: me._id, used: true }).orderBy('usedAt', 'desc').limit(50).get()
  return {
    list: r.data.map(p => Object.assign({ typeLabel: TYPE_LABEL[p.type] || '奖品' }, p)),
    logs: logRes.data,
    today: U.ymd(U.now())
  }
}

// 核销（店员/店长）
async function use(ctx, event) {
  const staff = await U.requireStaff(ctx)
  const p = await ctx.db.collection('prizes').doc(event.id).get()
  if (p.data.status !== 'unused') throw new Error('该奖品当前不可核销')
  if (new Date(p.data.expireAt).getTime() < Date.now()) {
    await ctx.db.collection('prizes').doc(event.id).update({ data: { status: 'expired' } })
    throw new Error('奖品已过期')
  }
  await ctx.db.collection('prizes').doc(event.id).update({
    data: { status: 'used', usedAt: U.now(), usedBy: staff.nickName || '店员' }
  })
  return { ok: true }
}

// 顾客核销后奖品列表联动店员端查询（店员按会员查）
async function byMember(ctx, event) {
  await U.requireStaff(ctx)
  const r = await ctx.db.collection('prizes')
    .where({ memberId: event.memberId }).orderBy('obtainedAt', 'desc').limit(50).get()
  return { list: r.data.map(p => Object.assign({ typeLabel: TYPE_LABEL[p.type] || '奖品' }, p)) }
}

module.exports = {
  poolList: poolList, poolUpsert: poolUpsert, poolToggle: poolToggle, poolRemove: poolRemove,
  status: status, draw: draw, mine: mine, use: use, byMember: byMember,
  DEFAULT_POOL: D.DEFAULT_PRIZE_POOL
}
