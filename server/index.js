const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static frontend
app.use(express.static(path.join(__dirname, '../client/public')));

// Waiting queues
const randomQueue = [];   // waiting for 1-on-1 random chat
const rooms = {};         // roomId -> [ws, ws]
const clientData = new Map(); // ws -> { roomId, type, username }

let onlineCount = 0;

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function tryMatchRandom() {
  while (randomQueue.length >= 2) {
    const ws1 = randomQueue.shift();
    const ws2 = randomQueue.shift();

    if (ws1.readyState !== 1) { randomQueue.unshift(ws2); continue; }
    if (ws2.readyState !== 1) continue;

    const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    rooms[roomId] = [ws1, ws2];
    clientData.get(ws1).roomId = roomId;
    clientData.get(ws2).roomId = roomId;

    send(ws1, { type: 'matched', roomId });
    send(ws2, { type: 'matched', roomId });
  }
}

wss.on('connection', (ws) => {
  onlineCount++;
  clientData.set(ws, { roomId: null, type: null });
  broadcast({ type: 'online_count', count: onlineCount });

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    const info = clientData.get(ws);

    switch (data.type) {
      case 'join_random':
        info.type = 'random';
        if (!randomQueue.includes(ws)) randomQueue.push(ws);
        send(ws, { type: 'waiting' });
        tryMatchRandom();
        break;

      case 'message':
        if (!info.roomId) return;
        const partners = rooms[info.roomId];
        if (!partners) return;
        partners.forEach(p => {
          if (p !== ws && p.readyState === 1) {
            send(p, { type: 'message', text: data.text, from: 'stranger' });
          }
        });
        break;

      case 'skip':
      case 'disconnect_chat':
        leaveRoom(ws, true);
        break;
    }
  });

  ws.on('close', () => {
    onlineCount = Math.max(0, onlineCount - 1);
    leaveRoom(ws, false);
    clientData.delete(ws);
    // remove from queue
    const qi = randomQueue.indexOf(ws);
    if (qi !== -1) randomQueue.splice(qi, 1);
    broadcast({ type: 'online_count', count: onlineCount });
  });
});

function leaveRoom(ws, notify) {
  const info = clientData.get(ws);
  if (!info || !info.roomId) return;
  const partners = rooms[info.roomId];
  if (partners) {
    partners.forEach(p => {
      if (p !== ws && p.readyState === 1) {
        send(p, { type: 'stranger_left' });
        clientData.get(p).roomId = null;
      }
    });
    delete rooms[info.roomId];
  }
  info.roomId = null;
}

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`StrangerLink running on http://localhost:${PORT}`));
