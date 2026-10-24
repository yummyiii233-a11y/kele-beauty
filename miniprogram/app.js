// 全局状态与登录
const api = require('./utils/cloud')

const ROLE_RANK = { customer: 0, staff: 1, manager: 2 }
const ROLE_TEXT = { customer: '顾客', staff: '店员', manager: '店长' }

App({
  globalData: {
    member: null,      // 当前会员（含 role: customer / staff / manager）
    lotteryPending: false,
    roleOverride: ''   // 本机身份预览（只允许切到不高于真实身份的档位）
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以启用云能力')
      return
    }
    wx.cloud.init({
      env: require('./utils/config').CLOUD_ENV,
      traceUser: true
    })
    // 恢复本机身份预览
    try {
      const ov = wx.getStorageSync('role_override')
      if (ov) this.globalData.roleOverride = ov
    } catch (e) { /* ignore */ }
    // 静默初始化：自动建集合并写入默认服务与奖池（幂等，失败不影响使用）
    wx.cloud.callFunction({ name: 'api', data: { action: 'misc.seed' } })
      .then(r => console.log('[init] 默认数据就绪', r.result && r.result.data))
      .catch(err => console.log('[init] 初始化跳过：', (err && err.message) || err))
  },

  // 拉取当前会员（未登录时自动注册为顾客）
  ensureMember(force) {
    const g = this.globalData
    if (g.member && !force) return Promise.resolve(g.member)
    return api.call('auth.login').then(data => {
      g.member = data.member
      this.notifyTabBars()
      return data.member
    })
  },

  // 真实身份（云端 member.role）
  realRole() {
    const m = this.globalData.member
    return (m && m.role) || 'customer'
  },

  // 生效身份 = 本机预览（若不高于真实身份），否则真实身份
  effectiveRole() {
    const real = this.realRole()
    const ov = this.globalData.roleOverride
    if (ov && ROLE_RANK[ov] <= ROLE_RANK[real]) return ov
    return real
  },

  canPreview(role) {
    return ROLE_RANK[role] !== undefined && ROLE_RANK[role] <= ROLE_RANK[this.realRole()]
  },

  // 切换本机身份预览（仅本机生效，不改云端角色）
  setRoleOverride(role) {
    this.globalData.roleOverride = role || ''
    try {
      if (role) wx.setStorageSync('role_override', role)
      else wx.removeStorageSync('role_override')
    } catch (e) { /* ignore */ }
    this.notifyTabBars()
  },

  // 退出登录：清空本地登录缓存与本机预览，下次进入自动以本微信重新登录
  logout() {
    this.globalData.member = null
    this.setRoleOverride('')
    try {
      wx.clearStorageSync()
    } catch (e) { /* ignore */ }
    this.notifyTabBars()
  },

  // 会员信息（含角色）加载后，让当前页面的自定义 tabBar 按角色重新渲染
  notifyTabBars() {
    getCurrentPages().forEach(p => {
      if (typeof p.getTabBar === 'function' && p.getTabBar()) {
        p.getTabBar().refresh()
      }
    })
  },

  isStaff() {
    const r = this.effectiveRole()
    return r === 'staff' || r === 'manager'
  },

  roleText(role) {
    return ROLE_TEXT[role || this.effectiveRole()] || ''
  }
})
