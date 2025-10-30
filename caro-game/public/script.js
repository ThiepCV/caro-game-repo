let myRole = "viewer";
let mySymbol = null;
let myName = null;
const socket = io();

// --- Khi kết nối thành công ---
socket.on("connect", () => {
  // if (!myName) {
  //   myName = prompt("Nhập tên của bạn:");
  //   socket.emit("joinGame", myName);
  // }
  if (!myName) {
  myName = prompt("Nhập tên của bạn:");
  if (!myName) return;

  const roleChoice = prompt("Chọn vai trò (nhập 'p' = Player hoặc 'v' = Viewer):", "p");
  const role = roleChoice?.toLowerCase() === "v" ? "viewer" : "player";
  socket.emit("joinGame", { name: myName, role });
}
});

// --- Khi kết nối không có tên  ---
socket.on("joinDenied", (msg) => {
  alert(msg);
  window.location.reload();
});
// --- Nhận role từ server ---
socket.on("roleAssign", ({ role, symbol }) => {
  myRole = role;
  mySymbol = symbol;

});

// --- Render bàn cờ ---
function renderBoard(board, lastMove, winCells) {
  const boardDiv = document.getElementById("board");
  boardDiv.innerHTML = "";
  const currentTurn = window.currentTurn || "X"; // fallback nếu chưa nhận updateBoard


  board.forEach((row, y) => {
    row.forEach((cell, x) => {
      const btn = document.createElement("button");
      btn.className = "cell";
      btn.textContent = cell || "";
      if (cell) btn.classList.add(cell);
      if (lastMove && lastMove[0] === x && lastMove[1] === y)
        btn.classList.add("highlight");
      if (winCells?.some(([wx, wy]) => wx === x && wy === y))
        btn.classList.add("win");

      // chỉ được click khi là người chơi, ô trống và đúng lượt
      if (myRole === "player" && !cell && mySymbol === currentTurn) {
        btn.onclick = () => {
          socket.emit("makeMove", { x, y });
        };
      }

      boardDiv.appendChild(btn);
    });
  });
}

// --- Nhận danh sách người chơi ---
socket.on("playerList", (players) => {
  const playerInfo = players
    .map(p => `${p.symbol}: ${p.name} ${p.ready ? "✅" : "⏳"}`)
    .join(" | ");
  document.getElementById("playerInfo").textContent = playerInfo;

  const me = players.find(p => p.name === myName);
  if (me) {
    myRole = "player";
    mySymbol = me.symbol;
    if (!me.ready) {
      const ready = confirm("Bấm OK để sẵn sàng bắt đầu game!");
      if (ready) socket.emit("setReady");
    }
  }
});

// --- Khi là khán giả ---
socket.on("spectator", () => {
  myRole = "viewer";
  document.getElementById("playerInfo").textContent = "👀 Bạn đang xem trận đấu";
});

// --- Cập nhật bàn cờ ---
socket.on("updateBoard", ({ board, currentTurn, lastMove }) => {
  window.currentBoard = board;
  window.currentTurn = currentTurn;
  renderBoard(board, lastMove);
  const turnDiv = document.getElementById("turnInfo");
  turnDiv.innerHTML = ` Lượt của: <b>${currentTurn}</b>`;
});

// --- Khi game kết thúc ---
socket.on("gameOver", ({ winner, symbol, cells }) => {
  renderBoard(window.currentBoard, null, cells);
  alert(`🎉 ${winner} (${symbol}) đã chiến thắng!`);
});



// ======================= CHAT ==========================

// Nhận lịch sử cũ
socket.on("initChat", (msgs) => {
  const chatBox = document.getElementById("chatBox");
  chatBox.innerHTML = "";
  msgs.forEach(m => addChat(m.name, m.msg));
});

// Nhận tin nhắn mới
socket.on("newChat", ({ name, msg }) => addChat(name, msg));

// Gửi tin nhắn mới
document.getElementById("sendChat").onclick = () => {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (text) {
    socket.emit("sendChat", text);
    input.value = "";
  }
};

// Hàm hiển thị tin nhắn
function addChat(name, msg) {
  const chatBox = document.getElementById("chatBox");
  const div = document.createElement("div");
  div.innerHTML = `<b>${name}:</b> ${msg}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ================== NÚT RESET GAME ==================
const resetBtn = document.getElementById("resetBtn");

socket.on("roleAssign", ({ role }) => {
  if (role === "player") resetBtn.classList.remove("hidden");
});

resetBtn.onclick = () => {
  if (confirm("Bắt đầu ván mới?")) socket.emit("resetBoard");
};


// ================== HIỂN THỊ BẢNG XẾP HẠNG ==================
async function loadRanking() {
  const res = await fetch("/ranking");
  const ranking = await res.json();
  const tbody = document.querySelector("#rankingTable tbody");
  tbody.innerHTML = "";
  ranking.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.rank}</td><td>${r.name}</td><td>${r.points}</td>`;
    tbody.appendChild(tr);
  });
}
document.getElementById("refreshRanking").onclick = loadRanking;