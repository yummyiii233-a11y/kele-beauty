// 服务项目
const U = require('../_utils')

async function list(ctx, event) {
  const where = { status: 'active' }
  if (event.category) where.category = String(event.category)
  const r = await ctx.db.collection('services')
    .where(where).orderBy('sort', 'asc').orderBy('createdAt', 'desc')
    .limit(100).get()
  return { list: r.data }
}

// 新增 / 编辑（店员/店长）
async function upsert(ctx, event) {
  await U.requireStaff(ctx)
  const name = String(event.name || '').trim()
  if (!name) throw new Error('请填写项目名称')
  const data = {
    name: name,
    category: String(event.category || '美甲'),
    price: U.toFen(event.price || 0),
    durationMin: parseInt(event.durationMin, 10) || 60,
    desc: String(event.desc || '').slice(0, 200),
    cover: String(event.cover || ''),     // 云存储 fileID
    hot: !!event.hot,
    sort: parseInt(event.sort, 10) || 0,
    status: 'active'
  }
  if (event.id) {
    await ctx.db.collection('services').doc(event.id).update({ data: data })
    return Object.assign({ _id: event.id }, data)
  }
  data.createdAt = U.now()
  const r = await ctx.db.collection('services').add({ data: data })
  return Object.assign({ _id: r._id }, data)
}

// 下架
async function remove(ctx, event) {
  await U.requireStaff(ctx)
  await ctx.db.collection('services').doc(event.id).update({ data: { status: 'off' } })
  return { ok: true }
}

module.exports = { list: list, upsert: upsert, remove: remove }
