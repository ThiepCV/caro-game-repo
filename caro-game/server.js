//logic csv
const fs = require("fs");
const csv = require("csv-parser");

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
let playerList = [];
// ✅ Load danh sách người chơi từ CSV

function loadPlayers() {
  playerList = [];

  // 1) Luôn đọc players.csv để xác thực tên
  const csvPath = "players.csv";
  if (!fs.existsSync(csvPath)) {
    console.warn(`⚠️ Không tìm thấy ${csvPath}. Hãy tạo file CSV trước.`);
  } else {
    const raw = fs.readFileSync(csvPath, "utf8");
    const lines = raw.trim().split(/\r?\n/).slice(1); // bỏ header
    for (const line of lines) {
      if (!line.trim()) continue;
      // hỗ trợ "id,name" đơn giản; nếu có dấu phẩy trong tên thì dùng parser nâng cao
      const [id, name] = line.split(",");
      if (name && name.trim()) {
        playerList.push({ id: (id || "").trim(), name: name.trim() });
      }
    }

  }

  // 2) Chỉ tạo matches.json nếu CHƯA tồn tại
  const matchesPath = "matches.json";
  if (fs.existsSync(matchesPath)) {
    console.log("📂 matches.json đã tồn tại, giữ nguyên dữ liệu cũ.");
  } else {
    const allMatches = generateMatches(playerList);
    fs.writeFileSync(matchesPath, JSON.stringify(allMatches, null, 2));
  }
}

loadPlayers();
// Hàm sinh vòng đấu tự động
function generateMatches(players) {
  const matches = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      matches.push({
        p1: players[i].name,
        p2: players[j].name,
        games: [], // chứa kết quả từng ván
        finished: false,
      });
    }
  }
  return matches;
}

// ================== HÀM TÍNH BẢNG XẾP HẠNG ==================

function calculateRanking(matches) {
  const stats = {};

  matches.forEach(m => {
    if (m.games.length === 0) return; // chưa đấu gì

    const winCountP1 = m.games.filter(g => g === m.p1).length;
    const winCountP2 = m.games.filter(g => g === m.p2).length;

    // Ai thắng lượt này?
    let winner = null;
    let diff = Math.abs(winCountP1 - winCountP2);

    if (winCountP1 > winCountP2) winner = m.p1;
    else if (winCountP2 > winCountP1) winner = m.p2;

    // Cập nhật thống kê cho cả 2 người
    for (const [name, wins, losses] of [
      [m.p1, winCountP1, winCountP2],
      [m.p2, winCountP2, winCountP1],
    ]) {
      if (!stats[name]) stats[name] = { points: 0, wins: 0, losses: 0, diff: 0 };

      stats[name].wins += wins;
      stats[name].losses += losses;
      stats[name].diff = stats[name].wins - stats[name].losses;

      // Người thắng Bo3 được 1 điểm
      if (winner === name && m.finished) stats[name].points += 1;
    }
  });

  // Trả về danh sách đã sắp xếp theo: điểm → hiệu số → thắng
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


let board = Array.from({ length: 15 }, () => Array(15).fill(null));
let players = {};
let currentTurn = "X";

function checkWin(board, x, y, symbol) {
  const dirs = [
    [1, 0],  // ngang
    [0, 1],  // dọc
    [1, 1],  // chéo xuống phải
    [1, -1]  // chéo lên phải
  ];

  const opponent = symbol === "X" ? "O" : "X";

  for (const [dx, dy] of dirs) {
    let count = 1;
    let cells = [[x, y]];

    // Đếm 1 phía
    let nx = x + dx;
    let ny = y + dy;
    while (nx >= 0 && nx < 15 && ny >= 0 && ny < 15 && board[ny][nx] === symbol) {
      count++;
      cells.push([nx, ny]);
      nx += dx;
      ny += dy;
    }
    // Vị trí kế sau chuỗi 1
    const end1 = [nx, ny];

    // Đếm phía ngược lại
    nx = x - dx;
    ny = y - dy;
    while (nx >= 0 && nx < 15 && ny >= 0 && ny < 15 && board[ny][nx] === symbol) {
      count++;
      cells.push([nx, ny]);
      nx -= dx;
      ny -= dy;
    }
    // Vị trí kế sau chuỗi 2
    const end2 = [nx, ny];

    // Nếu đủ 5 quân trở lên
    if (count >= 5) {
      // Kiểm tra 2 đầu có bị chặn không
      const end1Blocked =
        end1[0] < 0 ||
        end1[0] >= 15 ||
        end1[1] < 0 ||
        end1[1] >= 15 ||
        board[end1[1]]?.[end1[0]] === opponent;

      const end2Blocked =
        end2[0] < 0 ||
        end2[0] >= 15 ||
        end2[1] < 0 ||
        end2[1] >= 15 ||
        board[end2[1]]?.[end2[0]] === opponent;

      //Chỉ tính thắng nếu KHÔNG bị chặn cả 2 đầu
      if (!(end1Blocked && end2Blocked)) {
        return cells;
      } else {
        console.log(`Bị chặn hai đầu ở hướng [${dx},${dy}] — không tính thắng`);
      }
    }
  }
  return null;
}
function findOpponentName(myName) {
  const all = Object.values(players);
  const opponent = all.find(p => p.name !== myName);
  return opponent ? opponent.name : null;
}
io.on("connection", (socket) => {
  socket.emit("updateBoard", { board, currentTurn });

// socket.on("joinGame", (name) => {
//   // Kiểm tra tên trong CSV
//   const valid = playerList.find(p => p.name.toLowerCase() === name.toLowerCase());
//   if (!valid) {
//     socket.emit("joinDenied", "Tên không có trong danh sách người chơi hợp lệ!");
//     return;
//   }

//   if (Object.keys(players).length < 2) {
//     // Gán ký hiệu
//     const symbol = Object.keys(players).length === 0 ? "X" : "O";
//     players[socket.id] = { name, symbol, ready: false };

//     // Gửi vai trò riêng cho người này
//     socket.emit("roleAssign", { role: "player", symbol });

//     // Gửi danh sách toàn bộ người chơi cho mọi client
//     io.emit("playerList", Object.values(players));
//   } else {
//     // Nếu đủ 2 người rồi thì là viewer
//     socket.emit("roleAssign", { role: "viewer", symbol: null });
//   }
// });

// --- Người chơi join game ---
socket.on("joinGame", ({ name, role }) => {
  const cleanName = (name || "").trim();

  // Kiểm tra tên hợp lệ từ playerList
  const valid = playerList.find(p => p.name.toLowerCase() === cleanName.toLowerCase());
  if (!valid) {
    socket.emit("joinDenied", "Tên không có trong danh sách người chơi hợp lệ!");
    return;
  }

  // Nếu là viewer thì assign luôn
  if (role === "viewer") {
    socket.emit("roleAssign", { role: "viewer", symbol: null });
    return;
  }

  // Nếu là player và còn chỗ trống
  if (!players[socket.id] && Object.keys(players).length < 2) {
    const symbol = Object.keys(players).length === 0 ? "X" : "O";
    players[socket.id] = { name: cleanName, symbol, ready: true };
    socket.emit("roleAssign", { role: "player", symbol });

    // Gửi danh sách cập nhật
    io.emit("playerList", Object.values(players));

    //Nếu đủ 2 người chơi → bắt đầu ngay
    if (Object.keys(players).length === 2) {
      io.emit("gameStart");
      board = Array.from({ length: 15 }, () => Array(15).fill(null));
      currentTurn = "X";
      io.emit("updateBoard", { board, currentTurn, lastMove: null });
    }
  } else {
    // Quá 2 người → viewer
    socket.emit("roleAssign", { role: "viewer", symbol: null });
  }
});

  socket.on("setReady", () => {
    if (players[socket.id]) {
      players[socket.id].ready = true;
      io.emit("playerList", Object.values(players));
      if (Object.values(players).length === 2 && Object.values(players).every(p => p.ready)) {
        io.emit("gameStart");
        //Gửi lại bàn cờ khởi đầu và lượt đầu tiên (X)
  io.emit("updateBoard", { board, currentTurn: "X", lastMove: null });
      }
    }
  });

  // ======================= CHAT ==========================
let chatMessages = []; // Lưu tin nhắn tạm trong bộ nhớ

socket.on("sendChat", (msg) => {
  const player = players[socket.id];
  const name = player ? player.name : "Viewer";

  const message = { name, msg };
  chatMessages.push(message);

  io.emit("newChat", message); // Gửi cho tất cả người chơi + khán giả
});

// Gửi lịch sử chat cũ cho người mới join
socket.emit("initChat", chatMessages);
socket.on("makeMove", ({ x, y }) => {
  const player = players[socket.id];
  if (!player) {
    return;
  }

  if (board[y][x]) {
    return;
  }

  if (player.symbol !== currentTurn) {
    return;
  }

  board[y][x] = player.symbol;

  const winCells = checkWin(board, x, y, player.symbol);
  const nextTurn = currentTurn === "X" ? "O" : "X";

  io.emit("updateBoard", { board, currentTurn: nextTurn, lastMove: [x, y] });


 if (winCells) {
  io.emit("gameOver", { winner: player.name, symbol: player.symbol, cells: winCells });

  //BẮT ĐẦU LƯU KẾT QUẢ BO3
  try {
    const matches = JSON.parse(fs.readFileSync("matches.json", "utf8"));

    // Tìm trận tương ứng
    const match = matches.find(m =>
      (m.p1 === player.name && m.p2 === findOpponentName(player.name)) ||
      (m.p2 === player.name && m.p1 === findOpponentName(player.name))
    );

    if (match) {
      match.games.push(player.name);

      // Đếm số thắng mỗi người
      const winCountP1 = match.games.filter(g => g === match.p1).length;
      const winCountP2 = match.games.filter(g => g === match.p2).length;

      // Nếu một người thắng 2 trận -> kết thúc Bo3 sớm
      if (winCountP1 === 2 || winCountP2 === 2) {
        match.finished = true;
      }

      fs.writeFileSync("matches.json", JSON.stringify(matches, null, 2));
    }
  } catch (err) {
    console.error("⚠️ Không thể lưu kết quả trận:", err);
  }
  // KẾT THÚC LƯU KẾT QUẢ
}

  currentTurn = nextTurn;
});

socket.on("resetBoard", () => {
  //  Đảo vai trò X/O giữa 2 người chơi
  const playerArr = Object.values(players);
  if (playerArr.length === 2) {
    const [p1, p2] = playerArr;
    const oldSymbolP1 = p1.symbol;
    const oldSymbolP2 = p2.symbol;
    p1.symbol = oldSymbolP1 === "X" ? "O" : "X";
    p2.symbol = oldSymbolP2 === "X" ? "O" : "X";

    // Gửi lại role mới cho 2 người
    for (const [id, pl] of Object.entries(players)) {
      const rolePayload = { role: "player", symbol: pl.symbol };
      io.to(id).emit("roleAssign", rolePayload);
    }

  }

  //  Reset bàn cờ và bắt đầu với X (người đang cầm X mới)
  board = Array.from({ length: 15 }, () => Array(15).fill(null));
  currentTurn = "X";
  io.emit("updateBoard", { board, currentTurn, lastMove: null });
});



socket.on("disconnect", () => {
    if (players[socket.id]) {
      delete players[socket.id];
      io.emit("playerList", Object.values(players));
    }
  });
});
// ================== XEM BẢNG XẾP HẠNG ==================
app.get("/ranking", (req, res) => {
  try {
    const matches = JSON.parse(fs.readFileSync("matches.json", "utf8"));
    const ranking = calculateRanking(matches);
    res.json(ranking);
  } catch (err) {
    res.status(500).json({ error: "Không thể đọc bảng xếp hạng" });
  }
});
server.listen(3000, () => console.log("Server chạy tại http://localhost:3000"));
