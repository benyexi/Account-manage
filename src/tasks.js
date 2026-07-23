const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');

const tasks = new Map();
const MAX_HISTORY_PER_USER = 100;

function publicTask(task) {
  const { child, ...safe } = task;
  return safe;
}

function listForUser(userId) {
  return Array.from(tasks.values())
    .filter((task) => task.userId === Number(userId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicTask);
}

function pruneUserHistory(userId) {
  const history = listForUser(userId);
  for (const task of history.slice(MAX_HISTORY_PER_USER)) {
    tasks.delete(task.id);
  }
}

function startTask({ userId, ip, port, duration }) {
  const now = new Date();
  const task = {
    id: crypto.randomUUID(),
    userId: Number(userId),
    ip,
    port,
    duration,
    status: 'running',
    createdAt: now.toISOString(),
    startedAt: now.toISOString(),
    finishedAt: null,
    checks: 0,
    successes: 0,
    failures: 0,
    lastCheckedAt: null,
    lastReachable: null,
    lastLatencyMs: null,
    error: '',
    child: null,
  };

  const python = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
  const script = path.join(__dirname, '..', 'checktest.py');
  const child = spawn(python, [script, ip, String(port), String(duration)], {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  task.child = child;
  tasks.set(task.id, task);
  pruneUserHistory(userId);

  let stdoutBuffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.event === 'check') {
          task.checks += 1;
          task.lastCheckedAt = event.checkedAt || new Date().toISOString();
          task.lastReachable = Boolean(event.reachable);
          task.lastLatencyMs = Number.isFinite(event.latencyMs) ? event.latencyMs : null;
          if (event.reachable) task.successes += 1;
          else task.failures += 1;
        }
      } catch {
        // 只接受脚本产生的 JSON 行，其余输出忽略。
      }
    }
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-1000);
  });

  child.on('error', (error) => {
    task.status = 'error';
    task.error = error.message;
    task.finishedAt = new Date().toISOString();
    task.child = null;
  });

  child.on('close', (code, signal) => {
    if (task.status === 'cancelled') {
      task.finishedAt ||= new Date().toISOString();
    } else if (code === 0) {
      task.status = 'completed';
      task.finishedAt = new Date().toISOString();
    } else {
      task.status = 'error';
      task.error = (stderr.trim() || `检查进程异常结束（${signal || code}）`).slice(0, 500);
      task.finishedAt = new Date().toISOString();
    }
    task.child = null;
  });

  return publicTask(task);
}

function cancelTask(userId, taskId) {
  const task = tasks.get(taskId);
  if (!task || task.userId !== Number(userId)) return null;
  if (task.status === 'running') {
    task.status = 'cancelled';
    task.finishedAt = new Date().toISOString();
    task.child?.kill();
  }
  const cancelled = publicTask(task);
  tasks.delete(taskId);
  return cancelled;
}

function countRunning(userId) {
  return listForUser(userId).filter((task) => task.status === 'running').length;
}

module.exports = { listForUser, startTask, cancelTask, countRunning };
