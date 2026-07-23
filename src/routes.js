// REST API 路由
const express = require('express');
const net = require('net');
const db = require('./db');
const auth = require('./auth');
const tasks = require('./tasks');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const ROLES = ['admin', 'guest'];
const STATUSES = ['active', 'disabled'];
const AUTHORIZATION_PLANS = ['unchanged', 'none', 'day', 'month', 'permanent'];
const SLOT_PRICE = 300;
const MAX_SLOTS = 2147483;
const MAX_TASK_DURATION = 320;

function publicUser(u) {
  const { passwordHash, ...rest } = u;
  const authorized =
    u.role === 'admin' ||
    u.authorizationPermanent ||
    (u.authorizedUntil && new Date(u.authorizedUntil).getTime() > Date.now());
  return { ...rest, authorized };
}

function authorizationFields(plan) {
  if (!AUTHORIZATION_PLANS.includes(plan)) return null;
  if (plan === 'unchanged') return {};
  if (plan === 'none') return { authorizationPermanent: false, authorizedUntil: null };
  if (plan === 'permanent') return { authorizationPermanent: true, authorizedUntil: null };
  const duration = plan === 'day' ? 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return {
    authorizationPermanent: false,
    authorizedUntil: new Date(Date.now() + duration).toISOString(),
  };
}

function requireAuthorized(req, res, next) {
  if (!publicUser(req.user).authorized) {
    return res.status(403).json({ error: '账号尚未授权或授权已到期' });
  }
  next();
}

// 鉴权中间件
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = token && auth.getSession(token);
  if (!session) return res.status(401).json({ error: '未登录或登录已过期' });
  const user = db.findById(session.userId);
  if (!user || user.status !== 'active') return res.status(401).json({ error: '账号不可用' });
  req.user = user;
  req.token = token;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

// ---- 注册（公开，一律注册为游客）----
router.post('/register', (req, res) => {
  const { username, password, nickname, email } = req.body || {};
  if (!USERNAME_RE.test(username || '')) {
    return res.status(400).json({ error: '用户名须为 3-32 位字母、数字、下划线或连字符' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  if (db.findByUsername(username)) return res.status(409).json({ error: '用户名已存在' });

  const user = db.createUser({
    username,
    nickname: String(nickname || '').slice(0, 64),
    email: String(email || '').slice(0, 128),
    role: 'guest', // 注册账号固定为游客，角色不接受前端传入
    status: 'active',
    passwordHash: auth.hashPassword(password),
  });
  // 注册成功后直接登录
  db.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
  const token = auth.createSession(user.id);
  res.status(201).json({ token, user: publicUser(db.findById(user.id)) });
});

// ---- 登录 / 退出 ----
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const user = db.findByUsername(username);
  if (!user || !auth.verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  if (user.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
  db.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
  const token = auth.createSession(user.id);
  res.json({ token, user: publicUser(db.findById(user.id)) });
});

router.post('/logout', requireAuth, (req, res) => {
  auth.destroySession(req.token);
  res.json({ ok: true });
});

// ---- 个人中心（登录用户）----
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---- 商城与联通性检查任务 ----
router.post('/store/slots', requireAuth, (req, res) => {
  const quantity = Number(req.body?.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SLOTS) {
    return res.status(400).json({ error: '购买数量须为 1-10 的整数' });
  }
  const currentSlots = Math.min(Math.max(Number(req.user.slots) || 1, 1), MAX_SLOTS);
  if (currentSlots + quantity > MAX_SLOTS) {
    return res.status(400).json({ error: `最多拥有 ${MAX_SLOTS} 个卡槽` });
  }
  const cost = quantity * SLOT_PRICE;
  if ((Number(req.user.points) || 0) < cost) {
    return res.status(400).json({ error: `积分不足，需要 ${cost} 积分` });
  }
  const user = db.updateUser(req.user.id, {
    points: req.user.points - cost,
    slots: currentSlots + quantity,
  });
  res.json({ user: publicUser(user), cost });
});

router.get('/tasks', requireAuth, (req, res) => {
  res.json({ items: tasks.listForUser(req.user.id) });
});

router.post('/tasks', requireAuth, requireAuthorized, (req, res) => {
  const ip = String(req.body?.ip || '').trim();
  const port = Number(req.body?.port);
  const duration = Number(req.body?.duration);
  if (!net.isIP(ip)) return res.status(400).json({ error: '请输入有效的 IPv4 或 IPv6 地址' });
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return res.status(400).json({ error: '端口须为 1-65535 的整数' });
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > MAX_TASK_DURATION) {
    return res.status(400).json({ error: `持续时间须为 1-${MAX_TASK_DURATION} 秒` });
  }
  if (tasks.countRunning(req.user.id) >= req.user.slots) {
    return res.status(409).json({ error: `运行中的任务已达到 ${req.user.slots} 个卡槽上限` });
  }
  const task = tasks.startTask({ userId: req.user.id, ip, port, duration });
  res.status(201).json({ task });
});

router.delete('/tasks/:id', requireAuth, (req, res) => {
  const task = tasks.cancelTask(req.user.id, req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  res.json({ task });
});

// 修改自己的昵称 / 邮箱
router.put('/me', requireAuth, (req, res) => {
  const { nickname, email } = req.body || {};
  const fields = {};
  if (nickname !== undefined) fields.nickname = String(nickname).slice(0, 64);
  if (email !== undefined) fields.email = String(email).slice(0, 128);
  const user = db.updateUser(req.user.id, fields);
  res.json({ user: publicUser(user) });
});

// 修改自己的密码
router.post('/me/password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写完整' });
  if (String(newPassword).length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  if (!auth.verifyPassword(oldPassword, req.user.passwordHash)) {
    return res.status(400).json({ error: '原密码错误' });
  }
  db.updateUser(req.user.id, { passwordHash: auth.hashPassword(newPassword) });
  res.json({ ok: true });
});

// ---- 账号管理（仅管理员）----
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const { q = '', role = '', status = '', page = 1, pageSize = 10 } = req.query;
  let users = db.listUsers();
  const keyword = String(q).trim().toLowerCase();
  if (keyword) {
    users = users.filter(
      (u) =>
        u.username.toLowerCase().includes(keyword) ||
        (u.nickname || '').toLowerCase().includes(keyword) ||
        (u.email || '').toLowerCase().includes(keyword)
    );
  }
  if (role) users = users.filter((u) => u.role === role);
  if (status) users = users.filter((u) => u.status === status);

  const total = users.length;
  const size = Math.min(Math.max(parseInt(pageSize, 10) || 10, 1), 100);
  const current = Math.max(parseInt(page, 10) || 1, 1);
  const items = users
    .slice()
    .sort((a, b) => b.id - a.id)
    .slice((current - 1) * size, current * size)
    .map(publicUser);

  res.json({ items, total, page: current, pageSize: size });
});

router.get('/stats', requireAuth, requireAdmin, (req, res) => {
  const users = db.listUsers();
  res.json({
    total: users.length,
    active: users.filter((u) => u.status === 'active').length,
    disabled: users.filter((u) => u.status === 'disabled').length,
    admins: users.filter((u) => u.role === 'admin').length,
    guests: users.filter((u) => u.role === 'guest').length,
    authorized: users.filter((u) => publicUser(u).authorized).length,
  });
});

router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, nickname, email, role, status, remark, points, slots, authorizationPlan } =
    req.body || {};
  if (!USERNAME_RE.test(username || '')) {
    return res.status(400).json({ error: '用户名须为 3-32 位字母、数字、下划线或连字符' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: '角色不合法' });
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: '状态不合法' });
  const authFields = authorizationFields(authorizationPlan || 'none');
  if (!authFields) return res.status(400).json({ error: '授权时长不合法' });
  if (db.findByUsername(username)) return res.status(409).json({ error: '用户名已存在' });

  const user = db.createUser({
    username,
    nickname,
    email,
    role,
    status,
    remark,
    points: Math.max(0, Math.floor(Number(points) || 0)),
    slots: Math.min(Math.max(Math.floor(Number(slots) || 1), 1), MAX_SLOTS),
    ...authFields,
    passwordHash: auth.hashPassword(password),
  });
  res.status(201).json({ user: publicUser(user) });
});

router.put('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const target = db.findById(req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });

  const { nickname, email, role, status, remark, password, points, slots, authorizationPlan } =
    req.body || {};
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: '角色不合法' });
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: '状态不合法' });
  const authFields = authorizationFields(authorizationPlan || 'unchanged');
  if (!authFields) return res.status(400).json({ error: '授权时长不合法' });
  // 防止把自己降级或禁用导致失去管理入口
  if (target.id === req.user.id && ((role && role !== 'admin') || (status && status !== 'active'))) {
    return res.status(400).json({ error: '不能修改自己的角色或禁用自己' });
  }
  const fields = { nickname, email, role, status, remark, ...authFields };
  if (points !== undefined) {
    const value = Number(points);
    if (!Number.isInteger(value) || value < 0) return res.status(400).json({ error: '积分须为非负整数' });
    fields.points = value;
  }
  if (slots !== undefined) {
    const value = Number(slots);
    if (!Number.isInteger(value) || value < 1 || value > MAX_SLOTS) {
      return res.status(400).json({ error: `卡槽数须为 1-${MAX_SLOTS} 的整数` });
    }
    fields.slots = value;
  }
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    fields.passwordHash = auth.hashPassword(password);
  }
  const user = db.updateUser(target.id, fields);
  res.json({ user: publicUser(user) });
});

router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const target = db.findById(req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  db.deleteUser(target.id);
  res.json({ ok: true });
});

module.exports = router;
