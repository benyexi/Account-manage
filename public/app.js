const $ = (selector) => document.querySelector(selector);

const state = {
  token: localStorage.getItem('token') || '',
  me: null,
  tasks: [],
  pollTimer: null,
};

async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== '/login' && path !== '/register') {
    showAuth();
    throw new Error(data.error || '登录已过期');
  }
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.remove('hidden');
  clearTimeout(element._timer);
  element._timer = setTimeout(() => element.classList.add('hidden'), 2400);
}

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
}

function formatTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function showAuth() {
  clearInterval(state.pollTimer);
  state.pollTimer = null;
  state.token = '';
  state.me = null;
  localStorage.removeItem('token');
  $('#dashboard-view').classList.add('hidden');
  $('#auth-view').classList.remove('hidden');
}

function authorizationText(user) {
  if (user.role === 'admin' || user.authorizationPermanent) return '永久授权';
  if (!user.authorizedUntil) return '等待管理员授权';
  if (!user.authorized) return `已于 ${formatTime(user.authorizedUntil)} 到期`;
  return `授权有效至 ${formatTime(user.authorizedUntil)}`;
}

function renderDashboard() {
  const user = state.me;
  $('#auth-view').classList.add('hidden');
  $('#dashboard-view').classList.remove('hidden');
  $('#current-user').textContent = user.nickname || user.username;
  $('#p-username').textContent = user.nickname || user.username;
  $('#auth-detail').textContent = authorizationText(user);
  $('#points-value').textContent = user.points;
  $('#slots-value').textContent = user.slots;

  const badge = $('#authorization-badge');
  badge.textContent = user.authorized ? '已授权' : '未授权';
  badge.className = `authorization-badge ${user.authorized ? 'is-authorized' : 'is-unauthorized'}`;

  $('#unauthorized-notice').classList.toggle('hidden', user.authorized);
  $('#task-console').classList.toggle('hidden', !user.authorized);
}

function taskStatus(task) {
  const labels = {
    running: '检查中',
    completed: '已完成',
    cancelled: '已取消',
    error: '异常',
  };
  return labels[task.status] || task.status;
}

function renderTasks() {
  const running = state.tasks.filter((task) => task.status === 'running').length;
  $('#running-value').textContent = running;
  const grid = $('#task-grid');
  if (!state.tasks.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◇</div>
        <strong>暂无卡槽任务</strong>
        <span>授权后可创建 TCP 端口联通性检查。</span>
      </div>`;
    return;
  }

  grid.innerHTML = state.tasks
    .map((task) => {
      const result =
        task.lastReachable === null
          ? '等待首次检查'
          : task.lastReachable
            ? `端口可连接 · ${task.lastLatencyMs ?? '—'} ms`
            : '端口暂不可连接';
      return `
        <article class="task-card status-${escapeHtml(task.status)}">
          <div class="task-card-head">
            <span class="task-status">${taskStatus(task)}</span>
            <span class="task-time">${formatTime(task.createdAt)}</span>
          </div>
          <div class="task-endpoint">
            <div><span>服务器 IP</span><strong>${escapeHtml(task.ip)}</strong></div>
            <div><span>端口</span><strong>${task.port}</strong></div>
            <div><span>持续时间</span><strong>${task.duration} 秒</strong></div>
          </div>
          <div class="task-result ${task.lastReachable ? 'reachable' : ''}">
            ${escapeHtml(result)} · 已检查 ${task.checks} 次
          </div>
          ${task.error ? `<p class="task-error">${escapeHtml(task.error)}</p>` : ''}
          ${
            task.status === 'running'
              ? `<button class="btn btn-danger btn-block" data-cancel-task="${task.id}">取消任务</button>`
              : ''
          }
        </article>`;
    })
    .join('');
}

async function loadTasks() {
  const data = await api('/tasks');
  state.tasks = data.items;
  renderTasks();
}

async function refreshMe() {
  const data = await api('/me');
  state.me = data.user;
  renderDashboard();
}

function onLoggedIn(user, token) {
  state.me = user;
  if (token) {
    state.token = token;
    localStorage.setItem('token', token);
  }
  if (user.role === 'admin') {
    location.href = '/admin';
    return;
  }
  renderDashboard();
  loadTasks().catch((error) => toast(error.message));
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => loadTasks().catch(() => {}), 3000);
}

document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    const login = tab.dataset.tab === 'login';
    $('#login-form').classList.toggle('hidden', !login);
    $('#register-form').classList.toggle('hidden', login);
  })
);

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
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
  } catch (error) {
    $('#login-error').textContent = error.message;
  }
});

$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
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
    toast('注册成功，等待管理员授权');
    onLoggedIn(data.user, data.token);
  } catch (error) {
    $('#register-error').textContent = error.message;
  }
});

$('#btn-logout').addEventListener('click', async () => {
  try {
    await api('/logout', { method: 'POST' });
  } catch {}
  showAuth();
});

$('#btn-buy-slot').addEventListener('click', async () => {
  try {
    const data = await api('/store/slots', {
      method: 'POST',
      body: JSON.stringify({ quantity: 1 }),
    });
    state.me = data.user;
    renderDashboard();
    toast('购买成功，已增加 1 个任务卡槽');
  } catch (error) {
    toast(error.message);
  }
});

$('#task-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#task-error').textContent = '';
  try {
    await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        ip: $('#task-ip').value.trim(),
        port: Number($('#task-port').value),
        duration: Number($('#task-duration').value),
      }),
    });
    toast('联通性检查已启动');
    await loadTasks();
  } catch (error) {
    $('#task-error').textContent = error.message;
  }
});

$('#task-grid').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-cancel-task]');
  if (!button) return;
  try {
    const taskId = button.dataset.cancelTask;
    await api('/tasks/' + taskId, { method: 'DELETE' });
    state.tasks = state.tasks.filter((task) => task.id !== taskId);
    renderTasks();
    toast('任务已取消');
  } catch (error) {
    toast(error.message);
  }
});

$('#btn-refresh-tasks').addEventListener('click', () =>
  Promise.all([refreshMe(), loadTasks()]).catch((error) => toast(error.message))
);

(async function init() {
  if (!state.token) return showAuth();
  try {
    const data = await api('/me');
    onLoggedIn(data.user, null);
  } catch {
    showAuth();
  }
})();
