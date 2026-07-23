# 服务器联通性检查与账号管理

一个基于 **Node.js + Express + Python** 的账号授权、积分商城和 TCP 端口联通性检查面板。账号数据保存为本地 JSON 文件，无需安装数据库。

## 功能

**两种角色、两套界面：**

- 👤 **用户入口 `/`**：加载 `public/锁服.html`，支持注册、登录、授权状态、积分商城、任务卡槽和 TCP 联通性检查。
- ⚙️ **管理员后台 `/admin`**：管理账号、授权时长、积分、卡槽、角色与启用状态。

其他能力：

- 🔐 scrypt 密码哈希 + Bearer Token 会话（12 小时有效期）
- ⏱️ 管理员授权：1 天、1 个月、永久或取消授权
- 🛒 积分商城：300 积分购买 1 个任务卡槽，最多 10 个
- ◇ TCP 联通性检查：每 5 秒一次，单任务最长 300 秒，可随时取消
- 🔎 按用户名 / 昵称 / 邮箱搜索，按角色、状态筛选，分页展示
- 📊 统计面板：总账号数、已授权、管理员、游客、正常、已禁用
- 🛡️ 权限控制：管理接口仅管理员可用；不能删除 / 禁用 / 降级自己；注册接口不接受角色参数，固定为游客

## 快速开始

```bash
npm install
npm start
```

打开 http://localhost:3000

首次启动会自动创建默认管理员：

- 用户名：`admin`
- 密码：`admin123`（可通过环境变量 `ADMIN_PASSWORD` 自定义）

> ⚠️ 登录后请立即通过右上角「修改密码」更换默认密码。

## 配置

| 环境变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 服务端口 | `3000` |
| `ADMIN_PASSWORD` | 首次启动创建的管理员初始密码 | `admin123` |
| `DATA_DIR` | 用户数据存放目录（部署时指向持久化卷） | 项目内 `data/` |
| `PYTHON_BIN` | Python 可执行程序路径或命令 | Windows 为 `python`，其他系统为 `python3` |

## 部署到 Railway

仓库已内置 `railway.json` 部署配置，步骤如下：

1. 登录 [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo**，选择本仓库（首次需授权 Railway 访问你的 GitHub）。
2. 部署分支默认为 `main`（如需部署其他分支，在 Service → Settings → Source 中修改）。
3. **挂载持久化卷（重要，否则重新部署会丢数据）**：在 Service 上右键或进入 Settings → **Volumes** → Add Volume，挂载路径填 `/data`。
4. 在 Service → **Variables** 中添加环境变量：
   - `DATA_DIR` = `/data`
   - `ADMIN_PASSWORD` = 你自定义的初始管理员密码（建议设置，别用默认的 admin123）
5. 在 Service → Settings → **Networking** → Generate Domain，生成公网访问地址（Railway 自动提供 HTTPS）。
6. 打开生成的域名，用 `admin` + 你设置的密码登录即可。之后每次推送代码到部署分支，Railway 会自动重新部署。

> 提示：会话令牌保存在内存中，每次重新部署后需要重新登录，属正常现象。

## API 一览

所有接口前缀为 `/api`，除登录外均需请求头 `Authorization: Bearer <token>`。

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| POST | `/register` | 注册（固定为游客角色），返回 token | 公开 |
| POST | `/login` | 登录，返回 token | 公开 |
| POST | `/logout` | 退出登录 | 登录用户 |
| GET | `/me` | 当前用户信息 | 登录用户 |
| PUT | `/me` | 修改自己的昵称 / 邮箱 | 登录用户 |
| POST | `/me/password` | 修改自己的密码 | 登录用户 |
| POST | `/store/slots` | 使用积分购买任务卡槽 | 登录用户 |
| GET | `/tasks` | 查看自己的联通检查任务 | 登录用户 |
| POST | `/tasks` | 创建联通检查任务 | 已授权用户 |
| DELETE | `/tasks/:id` | 取消自己的任务 | 登录用户 |
| GET | `/stats` | 账号统计 | 管理员 |
| GET | `/users` | 用户列表（支持 `q`、`role`、`status`、`page`、`pageSize`） | 管理员 |
| POST | `/users` | 新增用户 | 管理员 |
| PUT | `/users/:id` | 编辑用户（含重置密码、改角色） | 管理员 |
| DELETE | `/users/:id` | 删除用户 | 管理员 |

## 项目结构

```
├── server.js          # 入口：启动服务、创建默认管理员
├── checktest.py       # 有频率和时长限制的 TCP 联通性检查脚本
├── CHANGELOG.md       # 功能变更与回退记录
├── src/
│   ├── db.js          # JSON 文件存储层（data/users.json）
│   ├── auth.js        # 密码哈希与会话管理
│   ├── routes.js      # REST API 路由
│   └── tasks.js       # 检查任务进程与状态管理
└── public/            # 前端页面（原生 HTML/CSS/JS，无构建步骤）
    ├── 锁服.html      # 用户入口：登录 / 注册 / 授权 / 商城 / 任务
    ├── app.js
    ├── admin.html     # 管理员后台（/admin）
    ├── admin.js
    └── style.css
```

## 说明

- 用户数据保存在 `data/users.json`（已加入 `.gitignore`，不会提交到仓库）。
- 会话令牌保存在内存中，服务重启后需要重新登录。
- 如需部署到公网，建议置于 HTTPS 反向代理（如 Nginx / Caddy）之后。
