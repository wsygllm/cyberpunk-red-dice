const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// 静态文件服务
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// ==================== 数据存储（内存） ====================
const users = new Map(); // username -> { password, socketId }
const rooms = new Map(); // roomId -> { id, name, password, creator, members: [], rolls: [] }

// ==================== 工具函数 ====================
function generateRoomId() {
  return 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function getPublicRoomInfo(room) {
  return {
    id: room.id,
    name: room.name,
    hasPassword: !!room.password,
    creator: room.creator,
    memberCount: room.members.length
  };
}

function getRoomDetail(room) {
  return {
    id: room.id,
    name: room.name,
    creator: room.creator,
    members: room.members,
    rolls: room.rolls.slice(-50), // 只返回最近50条
    data: room.data
  };
}

// ==================== HTTP API ====================

// 注册
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.json({ success: false, message: '请输入用户名和密码' });
  }
  
  if (users.has(username)) {
    return res.json({ success: false, message: '用户名已存在' });
  }
  
  users.set(username, { password, socketId: null });
  res.json({ success: true, message: '注册成功' });
});

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.json({ success: false, message: '请输入用户名和密码' });
  }
  
  const user = users.get(username);
  if (!user || user.password !== password) {
    return res.json({ success: false, message: '用户名或密码错误' });
  }
  
  res.json({ success: true, message: '登录成功', username });
});

// 获取房间列表
app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(getPublicRoomInfo);
  res.json({ success: true, rooms: roomList });
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'running',
    users: users.size,
    rooms: rooms.size
  });
});

// ==================== Socket.io 实时通信 ====================

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);
  
  let currentUser = null;
  let currentRoomId = null;
  
  // 用户认证
  socket.on('auth', (username) => {
    if (!users.has(username)) {
      socket.emit('auth_error', '用户不存在');
      return;
    }
    
    currentUser = username;
    const user = users.get(username);
    user.socketId = socket.id;
    
    console.log('用户认证成功:', username);
    socket.emit('auth_success', username);
  });
  
  // 创建房间
  socket.on('create_room', ({ roomName, password }) => {
    if (!currentUser) {
      socket.emit('error', '请先登录');
      return;
    }
    
    if (!roomName) {
      socket.emit('error', '请输入房间名称');
      return;
    }
    
    const roomId = generateRoomId();
    const room = {
      id: roomId,
      name: roomName,
      password: password || '',
      creator: currentUser,
      members: [currentUser],
      rolls: [],
      createdAt: Date.now(),
      // 房间共享数据
      data: {
        players: [],
        battleHistory: [],
        weapons: [],
        skills: [],
        lastUpdate: Date.now()
      }
    };
    
    rooms.set(roomId, room);
    currentRoomId = roomId;
    socket.join(roomId);
    
    console.log('房间创建:', roomName, 'by', currentUser);
    
    socket.emit('room_created', getRoomDetail(room));
    
    // 广播房间列表更新
    broadcastRoomList();
  });

  // 更新房间共享数据
  socket.on('update_shared_data', ({ type, data }) => {
    if (!currentUser || !currentRoomId) {
      socket.emit('error', '请先加入房间');
      return;
    }
    
    const room = rooms.get(currentRoomId);
    if (!room) {
      socket.emit('error', '房间不存在');
      return;
    }
    
    // 更新对应的数据
    if (type === 'players' && room.sharedData) {
      room.sharedData.players = data;
    } else if (type === 'history' && room.sharedData) {
      room.sharedData.history = data;
    } else if (type === 'weapons' && room.sharedData) {
      room.sharedData.weapons = data;
    } else if (type === 'skills' && room.sharedData) {
      room.sharedData.skills = data;
    }
    
    // 广播给房间里的所有人（包括发送者）
    io.to(currentRoomId).emit('shared_data_updated', {
      type: type,
      data: data,
      updatedBy: currentUser
    });
    
    console.log(currentUser, '更新了房间共享数据:', type);
  });

  // 更新房间数据
  socket.on('update_room_data', ({ type, data }) => {
    if (!currentUser || !currentRoomId) {
      socket.emit('error', '请先加入房间');
      return;
    }
    
    const room = rooms.get(currentRoomId);
    if (!room) {
      socket.emit('error', '房间不存在');
      return;
    }
    
    // 更新对应的数据
    if (type === 'players') {
      room.data.players = data;
    } else if (type === 'battleHistory') {
      room.data.battleHistory = data;
    } else if (type === 'weapons') {
      room.data.weapons = data;
    } else if (type === 'skills') {
      room.data.skills = data;
    } else if (type === 'all') {
      room.data = { ...room.data, ...data };
    }
    
    room.data.lastUpdate = Date.now();
    
    // 广播给房间里的其他人（不包括自己）
    socket.to(currentRoomId).emit('room_data_updated', {
      type: type,
      data: data,
      updatedBy: currentUser
    });
  });
  
  // 加入房间
  socket.on('join_room', ({ roomId, password }) => {
    if (!currentUser) {
      socket.emit('error', '请先登录');
      return;
    }
    
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', '房间不存在');
      return;
    }
    
    if (room.password && room.password !== password) {
      socket.emit('error', '密码错误');
      return;
    }
    
    // 如果已经在其他房间，先离开
    if (currentRoomId && currentRoomId !== roomId) {
      leaveCurrentRoom();
    }
    
    if (!room.members.includes(currentUser)) {
      room.members.push(currentUser);
    }
    
    currentRoomId = roomId;
    socket.join(roomId);
    
    console.log(currentUser, '加入房间:', room.name);
    
    socket.emit('room_joined', getRoomDetail(room));
    
    // 通知房间内其他人
    socket.to(roomId).emit('member_joined', {
      member: currentUser,
      members: room.members
    });
    
    // 广播房间列表更新
    broadcastRoomList();
  });

  // 更新房间共享数据
  socket.on('update_shared_data', ({ type, data }) => {
    if (!currentUser || !currentRoomId) {
      socket.emit('error', '请先加入房间');
      return;
    }
    
    const room = rooms.get(currentRoomId);
    if (!room) {
      socket.emit('error', '房间不存在');
      return;
    }
    
    // 更新对应的数据
    if (type === 'players' && room.sharedData) {
      room.sharedData.players = data;
    } else if (type === 'history' && room.sharedData) {
      room.sharedData.history = data;
    } else if (type === 'weapons' && room.sharedData) {
      room.sharedData.weapons = data;
    } else if (type === 'skills' && room.sharedData) {
      room.sharedData.skills = data;
    }
    
    // 广播给房间里的所有人（包括发送者）
    io.to(currentRoomId).emit('shared_data_updated', {
      type: type,
      data: data,
      updatedBy: currentUser
    });
    
    console.log(currentUser, '更新了房间共享数据:', type);
  });

  // 更新房间数据
  socket.on('update_room_data', ({ type, data }) => {
    if (!currentUser || !currentRoomId) {
      socket.emit('error', '请先加入房间');
      return;
    }
    
    const room = rooms.get(currentRoomId);
    if (!room) {
      socket.emit('error', '房间不存在');
      return;
    }
    
    // 更新对应的数据
    if (type === 'players') {
      room.data.players = data;
    } else if (type === 'battleHistory') {
      room.data.battleHistory = data;
    } else if (type === 'weapons') {
      room.data.weapons = data;
    } else if (type === 'skills') {
      room.data.skills = data;
    } else if (type === 'all') {
      room.data = { ...room.data, ...data };
    }
    
    room.data.lastUpdate = Date.now();
    
    // 广播给房间里的其他人（不包括自己）
    socket.to(currentRoomId).emit('room_data_updated', {
      type: type,
      data: data,
      updatedBy: currentUser
    });
  });
  
  // 离开房间
  socket.on('leave_room', () => {
    leaveCurrentRoom();
  });

  // 删除房间（只有房主可以删）
  socket.on('delete_room', () => {
    if (!currentUser || !currentRoomId) {
      socket.emit('error', '请先加入房间');
      return;
    }
    
    const room = rooms.get(currentRoomId);
    if (!room) {
      socket.emit('error', '房间不存在');
      return;
    }
    
    if (room.creator !== currentUser) {
      socket.emit('error', '只有房主可以删除房间');
      return;
    }
    
    // 通知房间内所有人
    io.to(currentRoomId).emit('room_deleted', { message: '房间已被房主删除' });
    
    rooms.delete(currentRoomId);
    console.log('房间被删除:', room.name, 'by', currentUser);
    
    currentRoomId = null;
    
    // 广播房间列表更新
    broadcastRoomList();
  });

  // 更新房间共享数据
  socket.on('update_shared_data', ({ type, data }) => {
    if (!currentUser || !currentRoomId) {
      socket.emit('error', '请先加入房间');
      return;
    }
    
    const room = rooms.get(currentRoomId);
    if (!room) {
      socket.emit('error', '房间不存在');
      return;
    }
    
    // 更新对应的数据
    if (type === 'players' && room.sharedData) {
      room.sharedData.players = data;
    } else if (type === 'history' && room.sharedData) {
      room.sharedData.history = data;
    } else if (type === 'weapons' && room.sharedData) {
      room.sharedData.weapons = data;
    } else if (type === 'skills' && room.sharedData) {
      room.sharedData.skills = data;
    }
    
    // 广播给房间里的所有人（包括发送者）
    io.to(currentRoomId).emit('shared_data_updated', {
      type: type,
      data: data,
      updatedBy: currentUser
    });
    
    console.log(currentUser, '更新了房间共享数据:', type);
  });

  // 更新房间数据
  socket.on('update_room_data', ({ type, data }) => {
    if (!currentUser || !currentRoomId) {
      socket.emit('error', '请先加入房间');
      return;
    }
    
    const room = rooms.get(currentRoomId);
    if (!room) {
      socket.emit('error', '房间不存在');
      return;
    }
    
    // 更新对应的数据
    if (type === 'players') {
      room.data.players = data;
    } else if (type === 'battleHistory') {
      room.data.battleHistory = data;
    } else if (type === 'weapons') {
      room.data.weapons = data;
    } else if (type === 'skills') {
      room.data.skills = data;
    } else if (type === 'all') {
      room.data = { ...room.data, ...data };
    }
    
    room.data.lastUpdate = Date.now();
    
    // 广播给房间里的其他人（不包括自己）
    socket.to(currentRoomId).emit('room_data_updated', {
      type: type,
      data: data,
      updatedBy: currentUser
    });
  });
  
  // 投掷骰子
  socket.on('roll_dice', ({ formula, result, detail }) => {
    if (!currentUser || !currentRoomId) {
      socket.emit('error', '请先加入房间');
      return;
    }
    
    const room = rooms.get(currentRoomId);
    if (!room) {
      socket.emit('error', '房间不存在');
      return;
    }
    
    const roll = {
      player: currentUser,
      formula,
      result,
      detail,
      time: Date.now()
    };
    
    room.rolls.push(roll);
    
    // 只保留最近100条记录
    if (room.rolls.length > 100) {
      room.rolls = room.rolls.slice(-100);
    }
    
    // 广播给房间内所有人
    io.to(currentRoomId).emit('dice_rolled', roll);
    
    console.log(currentUser, '投掷:', formula, '=', result);
  });
  
  // 断开连接
  socket.on('disconnect', () => {
    console.log('用户断开:', currentUser || socket.id);
    leaveCurrentRoom();
    
    if (currentUser) {
      const user = users.get(currentUser);
      if (user) {
        user.socketId = null;
      }
    }
  });
  
  // 离开当前房间的辅助函数
  function leaveCurrentRoom() {
    if (!currentRoomId || !currentUser) return;
    
    const room = rooms.get(currentRoomId);
    if (room) {
      room.members = room.members.filter(m => m !== currentUser);
      
      // 通知房间内其他人
      socket.to(currentRoomId).emit('member_left', {
        member: currentUser,
        members: room.members
      });
      
      // 房间没人了也不删除，持久存在，只有房主可以手动删除
      // if (room.members.length === 0) {
      //   rooms.delete(currentRoomId);
      //   console.log('房间解散:', room.name);
      // }
    }
    
    socket.leave(currentRoomId);
    currentRoomId = null;
    
    // 广播房间列表更新
    broadcastRoomList();
  }
});

// 广播房间列表给所有人
function broadcastRoomList() {
  const roomList = Array.from(rooms.values()).map(getPublicRoomInfo);
  io.emit('room_list_update', roomList);
}

// ==================== 启动服务器 ====================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🎲 骰子联机服务器已启动`);
  console.log(`📍 服务器地址: http://localhost:${PORT}`);
  console.log(`🔌 Socket.io 已就绪`);
  console.log(`\nAPI 接口:`);
  console.log(`  POST /api/register  - 注册`);
  console.log(`  POST /api/login     - 登录`);
  console.log(`  GET  /api/rooms     - 获取房间列表`);
  console.log(`  GET  /api/health    - 健康检查`);
});
