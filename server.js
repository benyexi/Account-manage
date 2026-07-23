const express = require('express');
const path = require('path');
const db = require('./src/db');
const auth = require('./src/auth');
const routes = require('./src/routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', routes);
app.use(express.static(path.join(__dirname, 'public')));

// 首次启动时创建默认管理员
function ensureAdmin() {
  if (db.listUsers().length > 0) return;
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  db.createUser({
    username: 'admin',
    nickname: '系统管理员',
    role: 'admin',
    status: 'active',
    passwordHash: auth.hashPassword(password),
    remark: '默认管理员，请尽快修改密码',
  });
  console.log(`已创建默认管理员：admin / ${password}（请登录后尽快修改密码）`);
}

ensureAdmin();

app.listen(PORT, () => {
  console.log(`账号管理后台已启动：http://localhost:${PORT}`);
});
