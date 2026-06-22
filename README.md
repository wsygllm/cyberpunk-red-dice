# 🎲 多人联机骰子工具 - 后端服务器

赛博朋克红 TRPG 多人联机骰子工具的后端服务器，基于 Node.js + Socket.io 实现实时通信。

---

## 📦 功能特点

- ✅ **用户系统**：注册、登录、密码验证
- ✅ **房间系统**：创建房间、设置密码、加入房间、自动解散
- ✅ **实时同步**：Socket.io 实时通信，毫秒级延迟
- ✅ **骰子投掷**：支持自定义骰子公式（XdY+Z 格式）
- ✅ **历史记录**：房间内投掷历史自动同步
- ✅ **成员管理**：实时显示房间成员列表，房主标识

---

## 🚀 快速开始

### 环境要求
- Node.js 16+
- npm 或 yarn

### 安装依赖
```bash
cd dice-server
npm install
```

### 启动服务器
```bash
# 普通启动
npm start

# 开发模式（自动重启）
npm run dev
```

服务器默认运行在 `http://localhost:3000`

---

## 🔧 配置

### 修改端口
设置环境变量 `PORT`：
```bash
PORT=8080 npm start
```

### 前端配置
修改前端 HTML 文件中的服务器地址：
```javascript
const SERVER_URL = 'http://localhost:3000'; // 修改为你的服务器地址
```

---

## 📡 API 接口

### 注册
```
POST /api/register
Content-Type: application/json

{
  "username": "玩家1",
  "password": "123456"
}
```

### 登录
```
POST /api/login
Content-Type: application/json

{
  "username": "玩家1",
  "password": "123456"
}
```

### 获取房间列表
```
GET /api/rooms
```

### 健康检查
```
GET /api/health
```

---

## 🔌 Socket.io 事件

### 客户端发送事件

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `auth` | username | Socket 认证 |
| `create_room` | { roomName, password } | 创建房间 |
| `join_room` | { roomId, password } | 加入房间 |
| `leave_room` | - | 离开房间 |
| `roll_dice` | { formula, result, detail } | 投掷骰子 |

### 服务端发送事件

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `auth_success` | username | 认证成功 |
| `auth_error` | message | 认证失败 |
| `room_created` | room | 房间创建成功 |
| `room_joined` | room | 加入房间成功 |
| `room_list_update` | rooms | 房间列表更新 |
| `member_joined` | { member, members } | 成员加入 |
| `member_left` | { member, members } | 成员离开 |
| `dice_rolled` | roll | 骰子投掷结果 |
| `error` | message | 错误消息 |

---

## 🏠 部署到服务器

### 方式一：直接运行
```bash
# 安装 pm2
npm install -g pm2

# 启动
pm2 start server.js --name dice-server

# 查看状态
pm2 status

# 查看日志
pm2 logs dice-server
```

### 方式二：Docker
创建 `Dockerfile`：
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

构建并运行：
```bash
docker build -t dice-server .
docker run -d -p 3000:3000 --name dice-server dice-server
```

### 方式三：部署到云平台
支持部署到：
- Vercel（需要适配 Serverless）
- Railway
- Render
- 阿里云 / 腾讯云 / 华为云

---

## ⚠️ 注意事项

1. **数据存储**：当前版本使用内存存储，服务器重启后数据会丢失
2. **生产环境**：建议添加数据库（Redis / MongoDB）持久化数据
3. **安全性**：生产环境请配置 CORS 白名单，不要使用 `origin: "*"`
4. **密码**：当前密码明文存储，生产环境请加密存储（bcrypt）

---

## 📁 项目结构

```
dice-server/
├── package.json      # 项目配置
├── server.js         # 服务器主文件
└── README.md         # 说明文档
```

---

## 🎮 前端使用

1. 启动后端服务器
2. 打开前端 HTML 文件
3. 注册账号并登录
4. 创建或加入房间
5. 开始投骰子！

---

## 🔄 后续优化建议

- [ ] 添加数据库持久化（Redis / MongoDB）
- [ ] 密码加密存储（bcrypt）
- [ ] 房间聊天功能
- [ ] 角色卡同步
- [ ] 战斗场景模板
- [ ] 管理员功能（踢人、禁言）
- [ ] 房间设置（最大人数、骰子规则）
