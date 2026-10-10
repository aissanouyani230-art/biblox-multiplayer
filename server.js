
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const players = new Map();

app.get("/", (req, res) => {
  res.send("BIBLOX multiplayer est en ligne !");
});

io.on("connection", (socket) => {
  console.log("Joueur connecté :", socket.id);

  socket.on("joinGame", ({ username, game }) => {
    if (!username || !game) return;

    socket.data.username = String(username).slice(0, 20);
    socket.data.game = String(game).slice(0, 50);

    socket.join(socket.data.game);

    players.set(socket.id, {
      id: socket.id,
      username: socket.data.username,
      game: socket.data.game,
      x: 0,
      y: 0,
      z: 0,
      skin: {}
    });

    socket.emit("players", [...players.values()].filter(
      p => p.game === socket.data.game && p.id !== socket.id
    ));

    socket.to(socket.data.game).emit("playerJoined", players.get(socket.id));
  });

  socket.on("move", (position) => {
    const player = players.get(socket.id);
    if (!player || !position) return;

    for (const key of ["x", "y", "z"]) {
      if (Number.isFinite(position[key])) {
        player[key] = Math.max(-10000, Math.min(10000, position[key]));
      }
    }

    socket.to(player.game).emit("playerMoved", {
      id: socket.id,
      x: player.x,
      y: player.y,
      z: player.z
    });
  });

  socket.on("updateSkin", (skin) => {
    const player = players.get(socket.id);
    if (!player || !skin || typeof skin !== "object") return;

    player.skin = skin;
    socket.to(player.game).emit("skinUpdated", {
      id: socket.id,
      skin: player.skin
    });
  });

  socket.on("disconnect", () => {
    const player = players.get(socket.id);
    if (player) {
      io.to(player.game).emit("playerLeft", { id: socket.id });
      players.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("BIBLOX prêt sur le port", PORT);
});
    
