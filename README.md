# 账号管理后台（Account Manage）

一个开箱即用的账号管理网页后台，基于 **Node.js + Express** 实现，数据保存为本地 JSON 文件，无需安装数据库。

## 功能

- 🔐 登录 / 退出（scrypt 密码哈希 + Bearer Token 会话，12 小时有效期）
- 👥 账号管理：新增、编辑、删除、启用 / 禁用
- 🔎 按用户名 / 昵称 / 邮箱搜索，按角色、状态筛选，分页展示
- 📊 统计面板：总账号数、正常、已禁用、管理员数量
- 🔑 修改自己的密码
- 🛡️ 权限控制：账号管理接口仅管理员可用；不能删除 / 禁用 / 降级自己

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
| POST | `/login` | 登录，返回 token | 公开 |
| POST | `/logout` | 退出登录 | 登录用户 |
| GET | `/me` | 当前用户信息 | 登录用户 |
| POST | `/me/password` | 修改自己的密码 | 登录用户 |
| GET | `/stats` | 账号统计 | 管理员 |
| GET | `/users` | 用户列表（支持 `q`、`role`、`status`、`page`、`pageSize`） | 管理员 |
| POST | `/users` | 新增用户 | 管理员 |
| PUT | `/users/:id` | 编辑用户（含重置密码） | 管理员 |
| DELETE | `/users/:id` | 删除用户 | 管理员 |

## 项目结构

```
├── server.js          # 入口：启动服务、创建默认管理员
├── src/
│   ├── db.js          # JSON 文件存储层（data/users.json）
│   ├── auth.js        # 密码哈希与会话管理
│   └── routes.js      # REST API 路由
└── public/            # 前端页面（原生 HTML/CSS/JS，无构建步骤）
    ├── index.html
    ├── style.css
    └── app.js
```

## 说明

- 用户数据保存在 `data/users.json`（已加入 `.gitignore`，不会提交到仓库）。
- 会话令牌保存在内存中，服务重启后需要重新登录。
- 如需部署到公网，建议置于 HTTPS 反向代理（如 Nginx / Caddy）之后。
