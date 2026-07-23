// 游客入口：登录 / 注册 / 个人中心（管理员登录后自动跳转 /admin）
const $ = (sel) => document.querySelector(sel);

const state = {
  token: localStorage.getItem('token') || '',
  me: null,
};

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login' && path !== '/register') {
    showAuth();
    throw new Error(data.error || '登录已过期');
  }
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 2200);
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showAuth() {
  state.token = '';
  localStorage.removeItem('token');
  $('#profile-view').classList.add('hidden');
  $('#auth-view').classList.remove('hidden');
}

function onLoggedIn(user, token) {
  state.me = user;
  if (token) {
    state.token = token;
    localStorage.setItem('token', token);
  }
  if (user.role === 'admin') {
    // 管理员进入管理界面
    location.href = '/admin';
    return;
  }
  renderProfile();
}

function renderProfile() {
  const u = state.me;
  $('#auth-view').classList.add('hidden');
  $('#profile-view').classList.remove('hidden');
  $('#current-user').textContent = u.nickname || u.username;
  $('#p-avatar').textContent = (u.nickname || u.username).slice(0, 1).toUpperCase();
  $('#p-username').textContent = u.username;
  const roleEl = $('#p-role');
  roleEl.textContent = u.role === 'admin' ? '管理员' : '游客';
  roleEl.className = 'tag ' + (u.role === 'admin' ? 'tag-admin' : 'tag-user');
  const statusEl = $('#p-status');
  statusEl.textContent = u.status === 'active' ? '正常' : '已禁用';
  statusEl.className = 'tag ' + (u.status === 'active' ? 'tag-active' : 'tag-disabled');
  $('#p-nickname').textContent = u.nickname || '—';
  $('#p-email').textContent = u.email || '—';
  $('#p-created').textContent = fmtTime(u.createdAt);
  $('#p-lastlogin').textContent = fmtTime(u.lastLoginAt);
}

// ---- 登录 / 注册 tab 切换 ----
document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    $('#login-form').classList.toggle('hidden', !isLogin);
    $('#register-form').classList.toggle('hidden', isLogin);
  })
);

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    const data = await api('/login', {
      method: 'POST',
      body: JSON.stringify({
        username: $('#login-username').value.trim(),
        password: $('#login-password').value,
      }),
    });
    onLoggedIn(data.user, data.token);
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#register-error').textContent = '';
  if ($('#reg-password').value !== $('#reg-confirm').value) {
    $('#register-error').textContent = '两次输入的密码不一致';
    return;
  }
  try {
    const data = await api('/register', {
      method: 'POST',
      body: JSON.stringify({
        username: $('#reg-username').value.trim(),
        password: $('#reg-password').value,
        nickname: $('#reg-nickname').value.trim(),
        email: $('#reg-email').value.trim(),
      }),
    });
    toast('注册成功');
    onLoggedIn(data.user, data.token);
  } catch (err) {
    $('#register-error').textContent = err.message;
  }
});

$('#btn-logout').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch {}
  showAuth();
});

// ---- 编辑资料 ----
$('#btn-edit-profile').addEventListener('click', () => {
  $('#f-nickname').value = state.me.nickname || '';
  $('#f-email').value = state.me.email || '';
  $('#profile-form-error').textContent = '';
  $('#profile-modal').classList.remove('hidden');
});

$('#profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#profile-form-error').textContent = '';
  try {
    const data = await api('/me', {
      method: 'PUT',
      body: JSON.stringify({
        nickname: $('#f-nickname').value.trim(),
        email: $('#f-email').value.trim(),
      }),
    });
    state.me = data.user;
    $('#profile-modal').classList.add('hidden');
    renderProfile();
    toast('资料已更新');
  } catch (err) {
    $('#profile-form-error').textContent = err.message;
  }
});

// ---- 修改密码 ----
$('#btn-change-pwd').addEventListener('click', () => {
  $('#p-old').value = $('#p-new').value = $('#p-confirm').value = '';
  $('#pwd-form-error').textContent = '';
  $('#pwd-modal').classList.remove('hidden');
});

$('#pwd-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#pwd-form-error').textContent = '';
  if ($('#p-new').value !== $('#p-confirm').value) {
    $('#pwd-form-error').textContent = '两次输入的新密码不一致';
    return;
  }
  try {
    await api('/me/password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword: $('#p-old').value, newPassword: $('#p-new').value }),
    });
    $('#pwd-modal').classList.add('hidden');
    toast('密码修改成功');
  } catch (err) {
    $('#pwd-form-error').textContent = err.message;
  }
});

// 弹窗关闭
document.querySelectorAll('[data-close]').forEach((btn) =>
  btn.addEventListener('click', () => btn.closest('.modal-mask').classList.add('hidden'))
);
document.querySelectorAll('.modal-mask').forEach((mask) =>
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.classList.add('hidden'); })
);

// ---- 启动 ----
(async function init() {
  if (!state.token) return showAuth();
  try {
    const data = await api('/me');
    onLoggedIn(data.user, null);
  } catch {
    showAuth();
  }
})();
