const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/health", (req, res) => {
  res.status(200).send("BIBLOX multiplayer est en ligne !");
});

const players = new Map();

function cleanText(value, maxLength = 180) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength);
}

function getRoom(game) {
  return "game:" + cleanText(game, 50).toLowerCase();
}

function publicPlayer(player) {
  return {
    id: player.id,
    username: player.username,
    game: player.game,
    x: player.x,
    y: player.y,
    z: player.z,
    skin: player.skin
  };
}

function leaveGame(socket) {
  const player = players.get(socket.id);
  if (!player) return;

  socket.to(player.room).emit("playerLeft", {
    id: socket.id
  });

  socket.leave(player.room);
  players.delete(socket.id);
  socket.emit("gameLeft");
}

io.on("connection", socket => {
  console.log("Joueur connecté :", socket.id);

  socket.on("joinGame", data => {
    if (!data) return;

    const username = cleanText(data.username, 20);
    const game = cleanText(data.game, 50);

    if (!username || !game) return;

    leaveGame(socket);

    const room = getRoom(game);

    const player = {
      id: socket.id,
      username,
      game,
      room,
      x: 0,
      y: 0,
      z: 0,
      skin: {}
    };

    socket.data.username = username;
    socket.data.game = game;
    socket.join(room);
    players.set(socket.id, player);

    socket.emit(
      "players",
      [...players.values()]
        .filter(p => p.room === room && p.id !== socket.id)
        .map(publicPlayer)
    );

    socket.to(room).emit("playerJoined", publicPlayer(player));

    console.log(username + " rejoint " + game);
  });

  socket.on("leaveGame", () => {
    leaveGame(socket);
  });

  socket.on("move", position => {
    const player = players.get(socket.id);
    if (!player || !position) return;

    for (const key of ["x", "y", "z"]) {
      if (Number.isFinite(position[key])) {
        player[key] = Math.max(
          -10000,
          Math.min(10000, position[key])
        );
      }
    }

    socket.to(player.room).emit("playerMoved", {
      id: socket.id,
      x: player.x,
      y: player.y,
      z: player.z
    });
  });

  socket.on("updateSkin", skin => {
    const player = players.get(socket.id);
    if (!player || !skin || typeof skin !== "object") return;

    player.skin = skin;

    socket.to(player.room).emit("skinUpdated", {
      id: socket.id,
      skin: player.skin
    });
  });

  socket.on("sendChatMessage", data => {
    const player = players.get(socket.id);
    if (!player || !data) return;

    const message = cleanText(data.message, 180);
    if (!message) return;

    io.to(player.room).emit("chatMessage", {
      id: socket.id,
      username: player.username,
      game: player.game,
      message,
      timestamp: Date.now()
    });
  });

  socket.on("disconnect", () => {
    leaveGame(socket);
    console.log("Joueur déconnecté :", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("BIBLOX prêt sur le port", PORT);
});