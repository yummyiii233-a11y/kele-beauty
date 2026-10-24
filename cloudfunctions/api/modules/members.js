// 会员管理（店员/店长）
const U = require('../_utils')

const PUBLIC_FIELDS = {
  _id: true, nickName: true, avatarUrl: true, phone: true, birthday: true,
  role: true, balance: true, spendTotal: true, remark: true, createdAt: true, status: true
}

async function list(ctx, event) {
  await U.requireStaff(ctx)
  const p = U.pager(event)
  let q = {}
  if (event.keyword) {
    const kw = String(event.keyword).trim()
    const reg = ctx.db.RegExp({ regexp: kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' })
    q = ctx.db.command.or([{ nickName: reg }, { phone: reg }])
  }
  const coll = ctx.db.collection('members')
  const [listRes, countRes] = await Promise.all([
    coll.where(q).orderBy('createdAt', 'desc').skip(p.skip).limit(p.pageSize).field(PUBLIC_FIELDS).get(),
    coll.where(q).count()
  ])
  return { list: listRes.data, total: countRes.total, page: p.page, pageSize: p.pageSize }
}

// 会员详情 + 次卡
async function detail(ctx, event) {
  const staff = await U.requireStaff(ctx)
  const r = await ctx.db.collection('members').doc(event.memberId).field(PUBLIC_FIELDS).get()
  const cards = await ctx.db.collection('cards')
    .where({ memberId: event.memberId }).orderBy('createdAt', 'desc').get()
  return { member: r.data, cards: cards.data, viewerRole: staff.role }
}

// 设置岗位（仅店长）
async function setRole(ctx, event) {
  const me = await U.requireManager(ctx)
  const role = String(event.role)
  if (['customer', 'staff', 'manager'].indexOf(role) < 0) throw new Error('无效岗位')
  if (event.memberId === me._id && role !== 'manager') throw new Error('不能取消自己的店长身份')
  await ctx.db.collection('members').doc(event.memberId).update({ data: { role: role } })
  return { ok: true }
}

// 店员补充资料
async function update(ctx, event) {
  await U.requireStaff(ctx)
  const patch = {}
  if (event.phone !== undefined) patch.phone = String(event.phone).slice(0, 20)
  if (event.birthday !== undefined) patch.birthday = String(event.birthday).slice(0, 10)
  if (event.remark !== undefined) patch.remark = String(event.remark).slice(0, 200)
  if (Object.keys(patch).length === 0) return { updated: 0 }
  await ctx.db.collection('members').doc(event.memberId).update({ data: patch })
  return { updated: 1 }
}

module.exports = { list: list, detail: detail, setRole: setRole, update: update }
