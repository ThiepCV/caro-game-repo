// ================== IMPORT THƯ VIỆN ==================
const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const csv = require("csv-parser");

// ================== KHỞI TẠO CƠ BẢN ==================
const app = express();
// const server = http.createServer(app);
const server = require("http").createServer(app);
// const io = new Server(server, {
//   pingInterval: 25000,
//   pingTimeout: 60000,
//   cors: { origin: "*" },
// });

const io = new Server(server);

// ⚙️ Serve file tĩnh
app.use(express.static(path.join(__dirname, "public")));

// 🏠 Route gốc (/) → trả file index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
// ================== PORT & HEALTH CHECK ==================
const PORT = process.env.PORT || 3000;

app.get("/healthz", (req, res) => res.status(200).send("ok"));

// ================== STATIC FILES ==================
app.use(express.static("public"));

// ================== UPLOAD / DOWNLOAD FILE ==================
const upload = multer({ storage: multer.memoryStorage() });
const MATCHES_PATH = path.join(process.cwd(), "matches.json");
const PLAYERS_PATH = path.join(process.cwd(), "players.csv");

app.get("/admin/download-matches", (req, res) => {
  if (!fs.existsSync(MATCHES_PATH)) return res.status(404).send("No matches found");
  return res.download(MATCHES_PATH, "matches.json");
});

app.post("/admin/upload-matches", upload.single("file"), (req, res) => {
  try {
    fs.writeFileSync(MATCHES_PATH, req.file.buffer);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/admin/download-players", (req, res) => {
  if (!fs.existsSync(PLAYERS_PATH)) return res.status(404).send("No players found");
  return res.download(PLAYERS_PATH, "players.csv");
});

app.post("/admin/upload-players", upload.single("file"), (req, res) => {
  try {
    fs.writeFileSync(PLAYERS_PATH, req.file.buffer);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ================== LOGIC CHÍNH ==================
let playerList = [];
let board = Array.from({ length: 15 }, () => Array(15).fill(null));
let players = {};
let currentTurn = "X";

// --- Đọc file players.csv ---
function loadPlayers() {
  playerList = [];
  const csvPath = "players.csv";
  if (!fs.existsSync(csvPath)) {
    console.warn(`⚠️ Không tìm thấy ${csvPath}.`);
    return;
  }

  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.trim().split(/\r?\n/).slice(1);
  for (const line of lines) {
    const [id, name] = line.split(",");
    if (name?.trim()) playerList.push({ id: id.trim(), name: name.trim() });
  }

  // Nếu chưa có matches.json thì mới tạo
  const matchesPath = "matches.json";
  if (fs.existsSync(matchesPath)) {
    console.log("📂 matches.json đã tồn tại, giữ nguyên.");
  } else {
    const allMatches = generateMatches(playerList);
    fs.writeFileSync(matchesPath, JSON.stringify(allMatches, null, 2));
    console.log(`🎯 Generated ${allMatches.length} matches.`);
  }
}

function generateMatches(players) {
  const matches = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      matches.push({ p1: players[i].name, p2: players[j].name, games: [], finished: false });
    }
  }
  return matches;
}

// ================== HÀM TÍNH RANKING ==================
function calculateRanking(matches) {
  const stats = {};
  matches.forEach(m => {
    if (m.games.length === 0) return;

    const w1 = m.games.filter(g => g === m.p1).length;
    const w2 = m.games.filter(g => g === m.p2).length;
    let winner = null;

    if (w1 > w2) winner = m.p1;
    else if (w2 > w1) winner = m.p2;

    for (const [name, wins, losses] of [
      [m.p1, w1, w2],
      [m.p2, w2, w1],
    ]) {
      if (!stats[name]) stats[name] = { points: 0, wins: 0, losses: 0, diff: 0 };
      stats[name].wins += wins;
      stats[name].losses += losses;
      stats[name].diff = stats[name].wins - stats[name].losses;
      if (winner === name && m.finished) stats[name].points += 1;
    }
  });

  return Object.entries(stats)
    .sort((a, b) => {
      const A = a[1], B = b[1];
      if (B.points !== A.points) return B.points - A.points;
      if (B.diff !== A.diff) return B.diff - A.diff;
      return B.wins - A.wins;
    })
    .map(([name, s], i) => ({
      rank: i + 1,
      name,
      points: s.points,
      wins: s.wins,
      losses: s.losses,
      diff: s.diff,
    }));
}

// ================== CHECK WIN ==================
function checkWin(board, x, y, symbol) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const opponent = symbol === "X" ? "O" : "X";

  for (const [dx, dy] of dirs) {
    let count = 1;
    let cells = [[x, y]];
    let nx = x + dx, ny = y + dy;
    while (nx >= 0 && nx < 15 && ny >= 0 && ny < 15 && board[ny][nx] === symbol) {
      count++; cells.push([nx, ny]);
      nx += dx; ny += dy;
    }
    const end1 = [nx, ny];
    nx = x - dx; ny = y - dy;
    while (nx >= 0 && nx < 15 && ny >= 0 && ny < 15 && board[ny][nx] === symbol) {
      count++; cells.push([nx, ny]);
      nx -= dx; ny -= dy;
    }
    const end2 = [nx, ny];
    if (count >= 5) {
      const block1 = board[end1[1]]?.[end1[0]] === opponent;
      const block2 = board[end2[1]]?.[end2[0]] === opponent;
      if (!(block1 && block2)) return cells;
    }
  }
  return null;
}

// ================== SOCKET.IO ==================
loadPlayers();

function findOpponentName(name) {
  const opp = Object.values(players).find(p => p.name !== name);
  return opp ? opp.name : null;
}

io.on("connection", (socket) => {
  console.log(`✅ Connected: ${socket.id}`);
  socket.emit("updateBoard", { board, currentTurn });

  socket.on("joinGame", ({ name, role }) => {
    const valid = playerList.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (!valid) {
      socket.emit("joinDenied", "Tên không có trong danh sách hợp lệ!");
      return;
    }

    if (role === "viewer") {
      socket.emit("roleAssign", { role: "viewer", symbol: null });
      return;
    }

    if (!players[socket.id] && Object.keys(players).length < 2) {
      const symbol = Object.keys(players).length === 0 ? "X" : "O";
      players[socket.id] = { name, symbol, ready: true };
      socket.emit("roleAssign", { role: "player", symbol });
      io.emit("playerList", Object.values(players));

      if (Object.keys(players).length === 2) {
        board = Array.from({ length: 15 }, () => Array(15).fill(null));
        currentTurn = "X";
        io.emit("updateBoard", { board, currentTurn, lastMove: null });
      }
    } else {
      socket.emit("roleAssign", { role: "viewer", symbol: null });
    }
  });

  socket.on("makeMove", ({ x, y }) => {
    const player = players[socket.id];
    if (!player || board[y][x] || player.symbol !== currentTurn) return;

    board[y][x] = player.symbol;
    const winCells = checkWin(board, x, y, player.symbol);
    const nextTurn = currentTurn === "X" ? "O" : "X";

    io.emit("updateBoard", { board, currentTurn: nextTurn, lastMove: [x, y] });

    if (winCells) {
      io.emit("gameOver", { winner: player.name, symbol: player.symbol, cells: winCells });
      try {
        const matches = JSON.parse(fs.readFileSync("matches.json", "utf8"));
        const match = matches.find(m =>
          (m.p1 === player.name && m.p2 === findOpponentName(player.name)) ||
          (m.p2 === player.name && m.p1 === findOpponentName(player.name))
        );
        if (match) {
          match.games.push(player.name);
          const w1 = match.games.filter(g => g === match.p1).length;
          const w2 = match.games.filter(g => g === match.p2).length;
          if (w1 === 2 || w2 === 2) match.finished = true;
          //tạm ẩn để thử vervel
          // fs.writeFileSync("matches.json", JSON.stringify(matches, null, 2));
        }
      } catch (err) {
        console.error("⚠️ Không thể lưu kết quả:", err);
      }
    }
    currentTurn = nextTurn;
  });

  socket.on("resetBoard", () => {
    const arr = Object.values(players);
    if (arr.length === 2) {
      [arr[0].symbol, arr[1].symbol] = [arr[1].symbol, arr[0].symbol];
      for (const [id, pl] of Object.entries(players))
        io.to(id).emit("roleAssign", { role: "player", symbol: pl.symbol });
    }
    board = Array.from({ length: 15 }, () => Array(15).fill(null));
    currentTurn = "X";
    io.emit("updateBoard", { board, currentTurn, lastMove: null });
  });

  socket.on("sendChat", (msg) => {
    const p = players[socket.id];
    const name = p ? p.name : "Viewer";
    io.emit("newChat", { name, msg });
  });

  socket.on("disconnect", () => {
    if (players[socket.id]) delete players[socket.id];
    io.emit("playerList", Object.values(players));
  });
});

// ================== API XEM RANKING ==================
app.get("/ranking", (req, res) => {
  try {
    const matches = JSON.parse(fs.readFileSync("matches.json", "utf8"));
    const ranking = calculateRanking(matches);
    res.json(ranking);
  } catch {
    res.status(500).json({ error: "Không thể đọc bảng xếp hạng" });
  }
});

// ================== START SERVER ==================
// server.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = app;
