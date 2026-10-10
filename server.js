const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// Afficher le jeu BIBLOX depuis index.html
app.use(express.static(path.join(__dirname)));

// Vérifier que le serveur fonctionne
app.get("/health", (req, res) => {
  res.status(200).send("BIBLOX multiplayer est en ligne !");
});

// Joueurs connectés
const players = new Map();

io.on("connection", (socket) => {
  console.log("Joueur connecté :", socket.id);

  socket.on("joinGame", (data) => {
    if (!data || !data.username || !data.game) return;

    const oldPlayer = players.get(socket.id);

    if (oldPlayer) {
      socket.leave(oldPlayer.game);
      socket.to(oldPlayer.game).emit("playerLeft", {
        id: socket.id
      });
      players.delete(socket.id);
    }

    const username = String(data.username).slice(0, 20);
    const game = String(data.game).slice(0, 50);

    socket.data.username = username;
    socket.data.game = game;
    socket.join(game);

    const player = {
      id: socket.id,
      username,
      game,
      x: 0,
      y: 0,
      z: 0,
      skin: {}
    };

    players.set(socket.id, player);

    socket.emit(
      "players",
      [...players.values()].filter(
        (p) => p.game === game && p.id !== socket.id
      )
    );

    socket.to(game).emit("playerJoined", player);
  });

  socket.on("move", (position) => {
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

    socket.to(player.game).emit("playerMoved", {
      id: socket.id,
      x: player.x,
      y: player.y,
      z: player.z
    });
  });

  socket.on("updateSkin", (skin) => {
    const player = players.get(socket.id);

    if (!player || !skin || typeof skin !== "object") {
      return;
    }

    player.skin = skin;

    socket.to(player.game).emit("skinUpdated", {
      id: socket.id,
      skin: player.skin
    });
  });

  socket.on("disconnect", () => {
    const player = players.get(socket.id);

    if (player) {
      io.to(player.game).emit("playerLeft", {
        id: socket.id
      });

      players.delete(socket.id);
    }

    console.log("Joueur déconnecté :", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("BIBLOX prêt sur le port", PORT);
});