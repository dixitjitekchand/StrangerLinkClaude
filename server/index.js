const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, '../client/public')));

// ── State ──
const randomQueue = [];
const chatRooms = {};        // roomId -> { members: [ws,ws], type: 'random'|'group', name? }
const groupRooms = {         // group name -> [ws, ...]
  'General': [], 'Gaming': [], 'Music': [], 'Tech': [], 'Movies & TV': [], 'Sports': [], 'Travel': []
};
const clientData = new Map(); // ws -> { roomId, mode, username }
let onlineCount = 0;

function send(ws, data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

function broadcastGroupCounts() {
  const counts = {};
  Object.keys(groupRooms).forEach(name => { counts[name] = groupRooms[name].length; });
  broadcast({ type: 'group_counts', counts });
}

function tryMatchRandom() {
  // Filter out disconnected clients from queue
  for (let i = randomQueue.length - 1; i >= 0; i--) {
    if (randomQueue[i].readyState !== 1) randomQueue.splice(i, 1);
  }
  while (randomQueue.length >= 2) {
    const ws1 = randomQueue.shift();
    const ws2 = randomQueue.shift();
    if (ws1.readyState !== 1) { randomQueue.unshift(ws2); continue; }
    if (ws2.readyState !== 1) continue;

    const roomId = `r_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    chatRooms[roomId] = { members: [ws1, ws2], type: 'random' };
    clientData.get(ws1).roomId = roomId;
    clientData.get(ws2).roomId = roomId;

    send(ws1, { type: 'matched', roomId });
    send(ws2, { type: 'matched', roomId });
  }
}

function leaveRoom(ws) {
  const info = clientData.get(ws);
  if (!info) return;

  // Leave random room
  if (info.roomId && chatRooms[info.roomId]) {
    const room = chatRooms[info.roomId];
    room.members.forEach(p => {
      if (p !== ws) {
        send(p, { type: 'stranger_left' });
        if (clientData.get(p)) clientData.get(p).roomId = null;
      }
    });
    delete chatRooms[info.roomId];
    info.roomId = null;
  }

  // Leave group room
  if (info.groupRoom && groupRooms[info.groupRoom]) {
    const arr = groupRooms[info.groupRoom];
    const idx = arr.indexOf(ws);
    if (idx !== -1) arr.splice(idx, 1);
    // notify others in group
    arr.forEach(p => send(p, { type: 'group_user_left', username: info.username, room: info.groupRoom, count: arr.length }));
    info.groupRoom = null;
    broadcastGroupCounts();
  }

  // Remove from random queue
  const qi = randomQueue.indexOf(ws);
  if (qi !== -1) randomQueue.splice(qi, 1);
}

wss.on('connection', (ws) => {
  onlineCount++;
  clientData.set(ws, { roomId: null, groupRoom: null, username: 'Anonymous' });
  broadcast({ type: 'online_count', count: onlineCount });
  // Send current group counts to new user
  const counts = {};
  Object.keys(groupRooms).forEach(n => { counts[n] = groupRooms[n].length; });
  send(ws, { type: 'group_counts', counts });

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    const info = clientData.get(ws);
    if (!info) return;

    switch (data.type) {

      case 'join_random':
        leaveRoom(ws);
        if (!randomQueue.includes(ws)) randomQueue.push(ws);
        send(ws, { type: 'waiting' });
        tryMatchRandom();
        break;

      case 'skip':
        leaveRoom(ws);
        if (!randomQueue.includes(ws)) randomQueue.push(ws);
        send(ws, { type: 'waiting' });
        tryMatchRandom();
        break;

      case 'stop':
        leaveRoom(ws);
        send(ws, { type: 'stopped' });
        break;

      case 'message':
        if (info.roomId && chatRooms[info.roomId]) {
          // Random 1-on-1 message
          chatRooms[info.roomId].members.forEach(p => {
            if (p !== ws) send(p, { type: 'message', text: data.text, from: 'stranger' });
          });
        } else if (info.groupRoom && groupRooms[info.groupRoom]) {
          // Group room message
          groupRooms[info.groupRoom].forEach(p => {
            if (p !== ws) send(p, { type: 'group_message', text: data.text, username: info.username, room: info.groupRoom });
          });
        }
        break;

      case 'join_group':
        leaveRoom(ws);
        const roomName = data.room;
        const username = (data.username || 'Anonymous').trim().slice(0, 20);
        if (!groupRooms[roomName]) break;
        info.groupRoom = roomName;
        info.username = username;
        groupRooms[roomName].push(ws);
        send(ws, { type: 'group_joined', room: roomName, username, count: groupRooms[roomName].length });
        groupRooms[roomName].forEach(p => {
          if (p !== ws) send(p, { type: 'group_user_joined', username, room: roomName, count: groupRooms[roomName].length });
        });
        broadcastGroupCounts();
        break;

      case 'leave_group':
        leaveRoom(ws);
        send(ws, { type: 'group_left' });
        break;
    }
  });

  ws.on('close', () => {
    onlineCount = Math.max(0, onlineCount - 1);
    leaveRoom(ws);
    clientData.delete(ws);
    broadcast({ type: 'online_count', count: onlineCount });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`StrangerLink on http://localhost:${PORT}`));
