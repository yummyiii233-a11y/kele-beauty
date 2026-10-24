// 预约
const U = require('../_utils')
// 可预约时段：12:30 起，门店营业到 22:00，每 1 小时一档
const TIME_SLOTS = ['12:30', '13:30', '14:30', '15:30', '16:30', '17:30', '18:30', '19:30', '20:30', '21:30']

const ACTIVE_STATUS = ['pending', 'confirmed']

async function create(ctx, event) {
  const me = await U.requireMember(ctx)
  const date = String(event.date || '').slice(0, 10)
  const timeSlot = String(event.timeSlot || '').slice(0, 5)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请选择预约日期')
  if (TIME_SLOTS.indexOf(timeSlot) < 0) throw new Error('请选择预约时段')
  if (!event.serviceId && !event.serviceName) throw new Error('请选择服务项目')
  const today = U.ymd(U.now())
  if (date < today) throw new Error('预约日期不能早于今天')

  // 同一时段门店只接一位预约
  const conflict = await ctx.db.collection('appointments')
    .where({ date: date, timeSlot: timeSlot, status: ctx.db.command.in(ACTIVE_STATUS) })
    .count()
  if (conflict.total > 0) throw new Error('该时段已被预约，请选择其他时段')

  const doc = {
    memberId: me._id,
    memberName: me.nickName || me.phone || '会员',
    memberPhone: me.phone || '',
    serviceId: event.serviceId || '',
    serviceName: String(event.serviceName || ''),
    category: String(event.category || ''),
    date: date,
    timeSlot: timeSlot,
    status: 'pending',   // pending 待接单 / confirmed 已接单 / done 已完成 / canceled 已取消
    remark: String(event.remark || '').slice(0, 200),
    photos: Array.isArray(event.photos)
      ? event.photos.filter(id => typeof id === 'string' && id.indexOf('cloud://') === 0).slice(0, 3)
      : [],
    claimedBy: '',       // 抢单的店员 memberId，空 = 待抢
    claimedName: '',
    claimedAt: null,
    createdAt: U.now()
  }
  const r = await ctx.db.collection('appointments').add({ data: doc })
  return Object.assign({ _id: r._id }, doc)
}

async function mine(ctx) {
  const me = await U.requireMember(ctx)
  const r = await ctx.db.collection('appointments')
    .where({ memberId: me._id })
    .orderBy('date', 'desc').orderBy('timeSlot', 'desc')
    .limit(50).get()
  return { list: r.data, today: U.ymd(U.now()) }
}

async function cancel(ctx, event) {
  const me = await U.requireMember(ctx)
  const appt = await ctx.db.collection('appointments').doc(event.id).get()
  if (appt.data.memberId !== me._id && !U.isStaff(me)) throw new Error('无权限')
  if (ACTIVE_STATUS.indexOf(appt.data.status) < 0) throw new Error('当前状态不可取消')
  await ctx.db.collection('appointments').doc(event.id).update({ data: { status: 'canceled' } })
  return { ok: true }
}

// 店员端：按日期查看预约
async function list(ctx, event) {
  await U.requireStaff(ctx)
  const where = {}
  if (event.date) where.date = String(event.date).slice(0, 10)
  if (event.status) where.status = String(event.status)
  const r = await ctx.db.collection('appointments')
    .where(where).orderBy('date', 'desc').orderBy('timeSlot', 'asc')
    .limit(100).get()
  return { list: r.data }
}

// ---------- 抢单模式 ----------

// 抢单大厅：待接单的顾客订单（未被任何店员抢走）
async function pool(ctx) {
  await U.requireStaff(ctx)
  const _ = ctx.db.command
  const r = await ctx.db.collection('appointments')
    .where({
      status: 'pending',
      claimedBy: _.or(_.exists(false), _.eq(''))
    })
    .orderBy('date', 'asc').orderBy('timeSlot', 'asc')
    .limit(50).get()
  return { list: r.data, today: U.ymd(U.now()) }
}

// 抢单：原子抢单，同一订单只有第一个抢到的店员成功
async function claim(ctx, event) {
  const me = await U.requireStaff(ctx)
  const _ = ctx.db.command
  const r = await ctx.db.collection('appointments')
    .where({
      _id: String(event.id || ''),
      status: 'pending',
      claimedBy: _.or(_.exists(false), _.eq(''))
    })
    .update({
      data: {
        claimedBy: me._id,
        claimedName: me.nickName || '店员',
        claimedAt: U.now(),
        status: 'confirmed'
      }
    })
  if (!r.stats || !r.stats.updated) throw new Error('手慢了，这个单刚被其他店员抢走')
  return { ok: true }
}

// 转出：把自己抢到的单放回大厅
async function release(ctx, event) {
  const me = await U.requireStaff(ctx)
  const _ = ctx.db.command
  const r = await ctx.db.collection('appointments')
    .where({ _id: String(event.id || ''), claimedBy: me._id, status: 'confirmed' })
    .update({
      data: {
        status: 'pending',
        claimedBy: _.remove(),
        claimedName: _.remove(),
        claimedAt: _.remove()
      }
    })
  if (!r.stats || !r.stats.updated) throw new Error('只有自己接的单才能转出')
  return { ok: true }
}

// 我的单：我抢到的订单
async function mineOrders(ctx) {
  const me = await U.requireStaff(ctx)
  const r = await ctx.db.collection('appointments')
    .where({ claimedBy: me._id })
    .orderBy('date', 'desc').orderBy('timeSlot', 'desc')
    .limit(50).get()
  return { list: r.data, today: U.ymd(U.now()) }
}

// 店员端：确认 / 完成 / 取消
async function setStatus(ctx, event) {
  await U.requireStaff(ctx)
  const status = String(event.status)
  if (['pending', 'confirmed', 'done', 'canceled'].indexOf(status) < 0) throw new Error('无效状态')
  await ctx.db.collection('appointments').doc(event.id).update({ data: { status: status } })
  return { ok: true }
}

// 某日各时段占用情况
async function slots(ctx, event) {
  const date = String(event.date || U.ymd(U.now())).slice(0, 10)
  const r = await ctx.db.collection('appointments')
    .where({ date: date, status: ctx.db.command.in(ACTIVE_STATUS) })
    .get()
  const taken = {}
  r.data.forEach(a => { taken[a.timeSlot] = true })
  return {
    date: date,
    slots: TIME_SLOTS.map(s => ({ time: s, taken: !!taken[s] }))
  }
}

module.exports = { create: create, mine: mine, cancel: cancel, list: list, setStatus: setStatus, slots: slots, pool: pool, claim: claim, release: release, mineOrders: mineOrders }
