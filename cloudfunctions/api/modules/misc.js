// 门店配置与初始化种子数据
const U = require('../_utils')
const D = require('../defaults')
const STORE_HOURS = '12:30 - 22:00'

async function get(ctx) {
  let doc = null
  try {
    const r = await ctx.db.collection('settings').doc('store').get()
    doc = r.data
  } catch (e) { /* 未初始化时使用默认值 */ }
  const store = Object.assign({ name: '可樂', slogan: '美甲 · 美睫 · 美容', hours: STORE_HOURS }, doc || {})
  if (!store.hours) store.hours = STORE_HOURS
  return { store: store }
}

// 全部集合名：seed 时自动创建，省去控制台手动建集合
const COLLECTIONS = ['members', 'cards', 'records', 'appointments', 'prize_pool', 'prizes', 'lottery_tickets', 'services', 'settings', 'payrolls', 'expenses']

// 逐个创建集合（已存在则跳过，幂等）
async function ensureCollections(ctx) {
  const created = []
  for (const c of COLLECTIONS) {
    try {
      await ctx.db.createCollection(c)
      created.push(c)
    } catch (e) { /* 集合已存在 */ }
  }
  return created
}

// 首次部署初始化：自动建集合 + 写入默认服务项目、奖池与门店配置（幂等）
async function seed(ctx) {
  const out = { services: 0, prizes: 0, settings: false, collectionsCreated: 0 }
  out.collectionsCreated = (await ensureCollections(ctx)).length
  const svcCount = await ctx.db.collection('services').count()
  if (svcCount.total === 0) {
    let sort = 0
    for (const s of D.DEFAULT_SERVICES) {
      await ctx.db.collection('services').add({
        data: Object.assign({ sort: sort++, status: 'active', cover: '', createdAt: U.now() }, s)
      })
      out.services++
    }
  }
  const poolCount = await ctx.db.collection('prize_pool').count()
  if (poolCount.total === 0) {
    for (const p of D.DEFAULT_PRIZE_POOL) {
      await ctx.db.collection('prize_pool').add({
        data: Object.assign({ enabled: true, createdAt: U.now() }, p)
      })
      out.prizes++
    }
  }
  try {
    await ctx.db.collection('settings').add({ data: { _id: 'store', name: '可樂', slogan: '美甲 · 美睫 · 美容', hours: STORE_HOURS } })
    out.settings = true
  } catch (e) { out.settings = false }
  return out
}

// 首次启用：把自己设为店长（仅当门店还没有任何店长时可用，用后自动失效）
async function claimManager(ctx) {
  const m = await U.requireMember(ctx)
  if (m.role === 'manager') return { role: 'manager' }
  const has = await ctx.db.collection('members').where({ role: 'manager' }).count()
  if (has.total > 0) throw new Error('门店已有店长，请联系店长在「会员管理」中为你设置岗位')
  await ctx.db.collection('members').doc(m._id).update({ data: { role: 'manager' } })
  return { role: 'manager' }
}

module.exports = { get: get, seed: seed, claimManager: claimManager }
