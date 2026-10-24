// 老板记账：支出登记 + 月度经营汇总（收入来自消费/充值流水，支出手工登记）
const U = require('../_utils')
const P = require('./payroll')

const EXPENSE_CATEGORIES = ['房租水电', '材料进货', '员工工资', '推广营销', '设备用品', '其他']

function curMonth() {
  const d = U.now()
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return d.getFullYear() + '-' + p(d.getMonth() + 1)
}

// 支出登记
async function addExpense(ctx, event) {
  await U.requireManager(ctx)
  const amount = U.toFen(event.amount)
  if (amount <= 0) throw new Error('请填写支出金额')
  const category = EXPENSE_CATEGORIES.indexOf(event.category) > -1 ? event.category : '其他'
  const date = String(event.date || U.ymd(U.now())).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('无效日期')
  const doc = {
    amount: amount,
    category: category,
    note: String(event.note || '').slice(0, 200),
    date: date,
    createdAt: U.now()
  }
  const r = await ctx.db.collection('expenses').add({ data: doc })
  return { id: r._id }
}

async function removeExpense(ctx, event) {
  await U.requireManager(ctx)
  await ctx.db.collection('expenses').doc(event.id).remove()
  return { ok: true }
}

// 某月支出列表
async function listExpense(ctx, event) {
  await U.requireManager(ctx)
  const month = String(event.month || curMonth()).slice(0, 7)
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  const start = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  const end = new Date(Number(m[1]), Number(m[2]), 1)
  const _ = ctx.db.command
  const r = await ctx.db.collection('expenses')
    .where({ date: _.gte(U.ymd(start)).and(_.lt(U.ymd(end))) })
    .orderBy('date', 'desc').limit(100).get()
  let total = 0
  r.data.forEach(x => { total += (x.amount || 0) })
  return { month: month, list: r.data, totalFen: total }
}

// 月度经营汇总：收入（消费 + 充值）、支出、利润、员工业绩提成
async function dashboard(ctx, event) {
  await U.requireManager(ctx)
  const month = String(event.month || curMonth()).slice(0, 7)
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  const start = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  const end = new Date(Number(m[1]), Number(m[2]), 1)
  const _ = ctx.db.command
  const inMonth = _.gte(start).and(_.lt(end))

  const [consumeRes, rechargeRes, expenseRes, memberRes, staffRes] = await Promise.all([
    ctx.db.collection('records').where({ kind: _.in(['consume', 'deduct']), createdAt: inMonth }).get(),
    ctx.db.collection('records').where({ kind: 'recharge', createdAt: inMonth }).get(),
    ctx.db.collection('expenses').where({ date: _.gte(U.ymd(start)).and(_.lt(U.ymd(end))) }).get(),
    ctx.db.collection('members').count(),
    ctx.db.collection('members').where({ role: _.in(['staff', 'manager']) }).get()
  ])

  let serviceIncome = 0, rechargeIncome = 0
  consumeRes.data.forEach(x => { serviceIncome += (x.amount || 0) })
  rechargeRes.data.forEach(x => { rechargeIncome += (x.amount || 0) })
  let expense = 0
  expenseRes.data.forEach(x => { expense += (x.amount || 0) })

  // 员工业绩（实时，未生成工资条前）
  const byStaff = []
  for (const s of staffRes.data) {
    let amount = 0, count = 0
    consumeRes.data.forEach(x => {
      if (x.staffId === s._id) { amount += (x.amount || 0); count++ }
    })
    if (count > 0 || s.role === 'staff') {
      byStaff.push({
        staffId: s._id,
        staffName: s.nickName || '员工',
        orderCount: count,
        serviceAmount: amount,
        commissionFen: Math.round(amount * (s.commissionRateBp || 0) / 10000),
        salaryBaseFen: s.salaryBaseFen || 0
      })
    }
  }
  byStaff.sort((a, b) => b.serviceAmount - a.serviceAmount)

  return {
    month: month,
    serviceIncome: serviceIncome,
    rechargeIncome: rechargeIncome,
    income: serviceIncome + rechargeIncome,
    expense: expense,
    profit: serviceIncome + rechargeIncome - expense,
    memberCount: memberRes.total,
    byStaff: byStaff
  }
}

module.exports = {
  addExpense: addExpense,
  removeExpense: removeExpense,
  listExpense: listExpense,
  dashboard: dashboard,
  EXPENSE_CATEGORIES: EXPENSE_CATEGORIES
}
