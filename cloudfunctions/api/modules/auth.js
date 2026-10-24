// 登录与个人资料
const U = require('../_utils')

// 顾客打开小程序即完成静默注册（role 默认 customer）
async function login(ctx) {
  let m = await U.getMemberByOpenid(ctx)
  if (!m) {
    // 首位注册的用户自动成为店长，免去初次启用时手动改数据库
    const total = await ctx.db.collection('members').count()
    const doc = {
      _openid: ctx.OPENID,
      nickName: '',
      avatarUrl: '',
      phone: '',
      birthday: '',
      gender: '',
      role: total.total === 0 ? 'manager' : 'customer',
      balance: 0,          // 储值余额（分）
      spendTotal: 0,       // 累计消费（分）
      remark: '',
      createdAt: U.now(),  // 办卡时间
      status: 'active'
    }
    const r = await ctx.db.collection('members').add({ data: doc })
    m = Object.assign({ _id: r._id }, doc)
  }
  return { member: m }
}

// 完善资料（昵称、头像、手机号、生日）
async function updateProfile(ctx, event) {
  const m = await U.requireMember(ctx)
  const patch = {}
  if (event.nickName !== undefined) patch.nickName = String(event.nickName).slice(0, 30)
  if (event.avatarUrl !== undefined) patch.avatarUrl = String(event.avatarUrl).slice(0, 500)
  if (event.phone !== undefined) patch.phone = String(event.phone).slice(0, 20)
  if (event.birthday !== undefined) patch.birthday = String(event.birthday).slice(0, 10)
  if (event.gender !== undefined) patch.gender = String(event.gender).slice(0, 10)
  if (Object.keys(patch).length === 0) return { updated: 0 }
  await ctx.db.collection('members').doc(m._id).update({ data: patch })
  return { updated: 1 }
}

module.exports = { login: login, updateProfile: updateProfile }
