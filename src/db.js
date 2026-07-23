// 简单的 JSON 文件存储层：数据保存在 data/users.json，无需安装数据库
const fs = require('fs');
const path = require('path');

// 部署到 Railway 等平台时，通过 DATA_DIR 指向持久化卷挂载路径（如 /data），避免重新部署丢数据
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');

let cache = null;

function load() {
  if (cache) return cache;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    cache = { users: [], nextId: 1 };
  }
  return cache;
}

function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function listUsers() {
  return load().users;
}

function findById(id) {
  return load().users.find((u) => u.id === Number(id)) || null;
}

function findByUsername(username) {
  return load().users.find((u) => u.username === username) || null;
}

function createUser(fields) {
  const db = load();
  const now = new Date().toISOString();
  const user = {
    id: db.nextId++,
    username: fields.username,
    nickname: fields.nickname || '',
    email: fields.email || '',
    role: fields.role || 'user',
    status: fields.status || 'active',
    passwordHash: fields.passwordHash,
    remark: fields.remark || '',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };
  db.users.push(user);
  save();
  return user;
}

function updateUser(id, fields) {
  const user = findById(id);
  if (!user) return null;
  const editable = ['nickname', 'email', 'role', 'status', 'passwordHash', 'remark', 'lastLoginAt'];
  for (const key of editable) {
    if (fields[key] !== undefined) user[key] = fields[key];
  }
  user.updatedAt = new Date().toISOString();
  save();
  return user;
}

function deleteUser(id) {
  const db = load();
  const idx = db.users.findIndex((u) => u.id === Number(id));
  if (idx === -1) return false;
  db.users.splice(idx, 1);
  save();
  return true;
}

module.exports = { listUsers, findById, findByUsername, createUser, updateUser, deleteUser };
