// 默认初始化数据（首次部署时由 misc.seed 写入数据库）
// cover 为配图路径（本地占位图）；部署后可将图片上传云存储并替换为 fileID
const CATEGORY_COVER = {
  '美甲': '/images/services/svc_nail.jpg',
  '美睫': '/images/services/svc_lash.jpg',
  '美容': '/images/services/svc_skin.jpg'
}
const DEFAULT_SERVICES = [
  { name: '经典纯色美甲', category: '美甲', price: 8800, durationMin: 60, desc: '纯色打底，显白百搭', hot: true },
  { name: '渐变猫眼美甲', category: '美甲', price: 12800, durationMin: 75, desc: '猫眼磁力渐变，光泽细腻', hot: true },
  { name: '日式手绘美甲', category: '美甲', price: 15800, durationMin: 90, desc: '一指一绘，专属定制' },
  { name: '自然舒适嫁接', category: '美睫', price: 9800, durationMin: 70, desc: '根根分明，自然有神', hot: true },
  { name: '浓密飞翘嫁接', category: '美睫', price: 12800, durationMin: 90, desc: '浓密卷翘，深邃电眼' },
  { name: '美睫补做（10 日内）', category: '美睫', price: 5000, durationMin: 40, desc: '嫁接 10 日内补做优惠' },
  { name: '深层清洁护理', category: '美容', price: 15800, durationMin: 60, desc: '疏通毛孔，净澈透亮', hot: true },
  { name: '补水焕肤管理', category: '美容', price: 19800, durationMin: 75, desc: '深层补水，焕亮肤色' },
  { name: '肩颈放松护理', category: '美容', price: 12800, durationMin: 45, desc: '舒缓肩颈，放松身心' }
].map(function (s) { s.cover = CATEGORY_COVER[s.category] || ''; return s })

// 奖池：probability 为权重（相对概率），type: coupon 优惠券 / service 免费项目 / gift 其他赠益
const DEFAULT_PRIZE_POOL = [
  { name: '美甲优惠 30 元', type: 'coupon', value: 3000, validDays: 30, probability: 20, stock: 999, remark: '任意美甲项目可用' },
  { name: '免费手部护理 1 次', type: 'service', serviceName: '手部护理', value: 0, validDays: 30, probability: 10, stock: 50, remark: '到店核销，提前预约' },
  { name: '美睫补做加赠 10 天', type: 'gift', value: 0, validDays: 30, probability: 15, stock: 999, remark: '美睫补做有效期延长 10 天' },
  { name: '下次消费立减 20 元', type: 'coupon', value: 2000, validDays: 30, probability: 20, stock: 999, remark: '不限项目，到店可用' },
  { name: '美容项目 88 折券', type: 'coupon', value: 1200, validDays: 30, probability: 15, stock: 999, remark: '美容类项目可用' },
  { name: '谢谢参与', type: 'none', value: 0, validDays: 0, probability: 20, stock: 999, remark: '下次再接再厉' }
]

// 单笔登记满该金额（分）可抽奖一次，0 表示每笔登记后均可抽奖
const LOTTERY_MIN_FEN = 0

module.exports = {
  DEFAULT_SERVICES: DEFAULT_SERVICES,
  DEFAULT_PRIZE_POOL: DEFAULT_PRIZE_POOL,
  LOTTERY_MIN_FEN: LOTTERY_MIN_FEN
}
