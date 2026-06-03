# StrangerLink

A real-time stranger chat web app — like Omegle/StrangerMeetup.

## Tech Stack
- **Backend**: Node.js + Express + WebSockets (ws)
- **Frontend**: Vanilla HTML/CSS/JS (no framework needed)
- **Real-time**: WebSocket for instant 1-on-1 matching and messaging

## Project Structure
```
strangerlink/
├── server/
│   └── index.js        ← Node.js backend + WebSocket server
├── client/
│   └── public/
│       └── index.html  ← Frontend (served by Express)
├── package.json
├── render.yaml         ← Render.com deploy config
└── README.md
```

## Run Locally
```bash
npm install
npm start
# Open http://localhost:3000
```

## Deploy Free on Render.com
1. Push this repo to GitHub
2. Go to render.com → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Click Deploy → Get free URL: `yourapp.onrender.com`

## Features
- ✅ Instant 1-on-1 random matching via WebSocket
- ✅ Random / Groups mode toggle
- ✅ Browse chat rooms (General, Dating, Friendship, Gaming, Music)
- ✅ Skip stranger & find new one
- ✅ Live online user count
- ✅ Mobile responsive
- ✅ No registration required
