
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// Fichier exact du jeu
const GAME_FILE = "BIBLOX_mobile_Xbox(1).html";
const GAME_PATH = path.join(__dirname, GAME_FILE);

app.use(express.static(__dirname));

// Page principale
app.get("/", (req, res) => {
  res.sendFile(GAME_PATH, (err) => {
    if (err) {
      console.error("Erreur de chargement du jeu :", err.message);
      if (!res.headersSent) {
        res.status(404).send(
          `Fichier introuvable : ${GAME_FILE}`
        );
      }
    }
  });
});

// Vérification du serveur
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    game: "BIBLOX",
    multiplayer: true,
    mobile: true,
    xboxController: true
  });
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

  // Rejoindre une partie
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

    // Envoyer les joueurs déjà présents
    socket.emit(
      "players",
      [...players.values()]
        .filter(p => p.room === room && p.id !== socket.id)
        .map(publicPlayer)
    );

    // Prévenir les autres joueurs
    socket.to(room).emit(
      "playerJoined",
      publicPlayer(player)
    );

    console.log(username + " rejoint " + game);
  });

  // Quitter une partie
  socket.on("leaveGame", () => {
    leaveGame(socket);
  });

  // Synchroniser les déplacements
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

  // Mettre à jour le skin
  socket.on("updateSkin", skin => {
    const player = players.get(socket.id);

    if (
      !player ||
      !skin ||
      typeof skin !== "object" ||
      Array.isArray(skin)
    ) {
      return;
    }

    player.skin = skin;

    socket.to(player.room).emit("skinUpdated", {
      id: socket.id,
      skin: player.skin
    });
  });

  // Chat entre joueurs de la même partie
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

  // Déconnexion
  socket.on("disconnect", () => {
    leaveGame(socket);
    console.log("Joueur déconnecté :", socket.id);
  });
});

// Démarrage du serveur
const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("BIBLOX prêt sur le port", PORT);
});
