// 管理员界面逻辑（/admin）：未登录或非管理员会被送回游客入口 /
const $ = (sel) => document.querySelector(sel);

const state = {
  token: localStorage.getItem('token') || '',
  me: null,
  page: 1,
  pageSize: 10,
  total: 0,
  editingId: null, // null = 新增
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
  if (res.status === 401) {
    localStorage.removeItem('token');
    location.href = '/';
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

async function loadStats() {
  const s = await api('/stats');
  $('#stat-total').textContent = s.total;
  $('#stat-admins').textContent = s.admins;
  $('#stat-guests').textContent = s.guests;
  $('#stat-active').textContent = s.active;
  $('#stat-disabled').textContent = s.disabled;
}

async function loadUsers() {
  const params = new URLSearchParams({
    q: $('#search-input').value.trim(),
    role: $('#filter-role').value,
    status: $('#filter-status').value,
    page: state.page,
    pageSize: state.pageSize,
  });
  const data = await api('/users?' + params);
  state.total = data.total;

  const tbody = $('#user-tbody');
  if (!data.items.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#8a90a0;padding:30px">暂无数据</td></tr>';
  } else {
    tbody.innerHTML = data.items
      .map(
        (u) => `
      <tr>
        <td>${u.id}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.nickname) || '—'}</td>
        <td>${escapeHtml(u.email) || '—'}</td>
        <td><span class="tag ${u.role === 'admin' ? 'tag-admin' : 'tag-user'}">${u.role === 'admin' ? '管理员' : '游客'}</span></td>
        <td><span class="tag ${u.status === 'active' ? 'tag-active' : 'tag-disabled'}">${u.status === 'active' ? '正常' : '已禁用'}</span></td>
        <td>${fmtTime(u.lastLoginAt)}</td>
        <td>${fmtTime(u.createdAt)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-sm" data-edit="${u.id}">编辑</button>
            <button class="btn btn-sm" data-toggle="${u.id}" data-status="${u.status}">${u.status === 'active' ? '禁用' : '启用'}</button>
            <button class="btn btn-sm btn-danger" data-del="${u.id}" data-name="${escapeHtml(u.username)}">删除</button>
          </div>
        </td>
      </tr>`
      )
      .join('');
  }

  const totalPages = Math.max(Math.ceil(state.total / state.pageSize), 1);
  $('#page-info').textContent = `第 ${state.page} / ${totalPages} 页，共 ${state.total} 条`;
  $('#btn-prev').disabled = state.page <= 1;
  $('#btn-next').disabled = state.page >= totalPages;
}

function openUserModal(user) {
  state.editingId = user ? user.id : null;
  $('#user-modal-title').textContent = user ? `编辑账号：${user.username}` : '新增账号';
  $('#f-username').value = user ? user.username : '';
  $('#f-username').disabled = !!user;
  $('#f-password').value = '';
  $('#f-password').placeholder = user ? '留空则不修改密码' : '至少 6 位';
  $('#f-password').required = !user;
  $('#f-nickname').value = user?.nickname || '';
  $('#f-email').value = user?.email || '';
  $('#f-role').value = user?.role || 'guest';
  $('#f-status').value = user?.status || 'active';
  $('#f-remark').value = user?.remark || '';
  $('#user-form-error').textContent = '';
  $('#user-modal').classList.remove('hidden');
}

$('#btn-logout').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch {}
  localStorage.removeItem('token');
  location.href = '/';
});

$('#btn-search').addEventListener('click', () => { state.page = 1; loadUsers(); });
$('#search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { state.page = 1; loadUsers(); }
});
$('#filter-role').addEventListener('change', () => { state.page = 1; loadUsers(); });
$('#filter-status').addEventListener('change', () => { state.page = 1; loadUsers(); });
$('#btn-prev').addEventListener('click', () => { state.page--; loadUsers(); });
$('#btn-next').addEventListener('click', () => { state.page++; loadUsers(); });

$('#btn-add').addEventListener('click', () => openUserModal(null));

$('#user-tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  try {
    if (btn.dataset.edit) {
      const data = await api('/users?q=&page=1&pageSize=100');
      const user = data.items.find((u) => u.id === Number(btn.dataset.edit));
      if (user) openUserModal(user);
    } else if (btn.dataset.toggle) {
      const next = btn.dataset.status === 'active' ? 'disabled' : 'active';
      await api('/users/' + btn.dataset.toggle, { method: 'PUT', body: JSON.stringify({ status: next }) });
      toast(next === 'active' ? '已启用' : '已禁用');
      await Promise.all([loadStats(), loadUsers()]);
    } else if (btn.dataset.del) {
      if (!confirm(`确定删除账号「${btn.dataset.name}」？此操作不可恢复。`)) return;
      await api('/users/' + btn.dataset.del, { method: 'DELETE' });
      toast('已删除');
      await Promise.all([loadStats(), loadUsers()]);
    }
  } catch (err) {
    toast(err.message);
  }
});

$('#user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#user-form-error').textContent = '';
  const body = {
    nickname: $('#f-nickname').value.trim(),
    email: $('#f-email').value.trim(),
    role: $('#f-role').value,
    status: $('#f-status').value,
    remark: $('#f-remark').value.trim(),
  };
  const password = $('#f-password').value;
  if (password) body.password = password;
  try {
    if (state.editingId) {
      await api('/users/' + state.editingId, { method: 'PUT', body: JSON.stringify(body) });
      toast('已保存');
    } else {
      body.username = $('#f-username').value.trim();
      await api('/users', { method: 'POST', body: JSON.stringify(body) });
      toast('已创建');
    }
    $('#user-modal').classList.add('hidden');
    await Promise.all([loadStats(), loadUsers()]);
  } catch (err) {
    $('#user-form-error').textContent = err.message;
  }
});

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

document.querySelectorAll('[data-close]').forEach((btn) =>
  btn.addEventListener('click', () => btn.closest('.modal-mask').classList.add('hidden'))
);
document.querySelectorAll('.modal-mask').forEach((mask) =>
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.classList.add('hidden'); })
);

// ---- 启动：必须是已登录的管理员 ----
(async function init() {
  if (!state.token) { location.href = '/'; return; }
  try {
    const data = await api('/me');
    if (data.user.role !== 'admin') { location.href = '/'; return; }
    state.me = data.user;
    $('#current-user').textContent = `${state.me.nickname || state.me.username}（管理员）`;
    $('#admin-view').classList.remove('hidden');
    await Promise.all([loadStats(), loadUsers()]);
  } catch {
    // api() 内部已处理跳转
  }
})();
