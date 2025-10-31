docker run --rm -it -e NGROK_AUTHTOKEN=xxxxxxxxx -p 4040:4040 ngrok/ngrok:latest http host.docker.internal:3000
1. setup env:
npm install csv-parser
npm init -y
npm install multer  
npm install express socket.io
2. run
   node server.js

4. cấu trúc thư mục:
├── server.js
├── package.json
├── players.csv
├── matches.json
└── public/
    ├── index.html      
    ├── style.css        
    └── script.js        



┌────────────┐      WebSocket       ┌────────────┐
│ Player A   │  <-----------------> │  Server    │  <----------------->  │ Player B │
└────────────┘                      └────────────┘                      └────────────┘
                                               │
                                               ▼
                                         Viewers (read-only)
