// 通用格式化工具

function pad(n) { return n < 10 ? '0' + n : '' + n }

function dateStr(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function timeStr(d) {
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function dateTimeStr(d) {
  return dateStr(d) + ' ' + timeStr(d)
}

// 分 -> 元（字符串，去掉多余的 0）
function fen2yuan(fen) {
  if (fen === null || fen === undefined) return '0'
  const v = (Number(fen) / 100).toFixed(2)
  return v.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

// 元(数字或字符串) -> 分（整数）
function yuan2fen(yuan) {
  const n = Number(yuan)
  if (isNaN(n)) return 0
  return Math.round(n * 100)
}

function fmtDate(ts) {
  if (!ts) return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  return dateStr(d)
}

function fmtDateTime(ts) {
  if (!ts) return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  return dateTimeStr(d)
}

// 未来 N 天日期列表，用于预约选择
function nextDays(n) {
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const out = []
  const today = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime() + i * 86400000)
    out.push({
      value: dateStr(d),
      label: i === 0 ? '今天' : (i === 1 ? '明天' : (d.getMonth() + 1) + '月' + d.getDate() + '日'),
      week: week[d.getDay()]
    })
  }
  return out
}

module.exports = {
  fen2yuan: fen2yuan,
  yuan2fen: yuan2fen,
  fmtDate: fmtDate,
  fmtDateTime: fmtDateTime,
  nextDays: nextDays,
  dateStr: dateStr,
  timeStr: timeStr
}
