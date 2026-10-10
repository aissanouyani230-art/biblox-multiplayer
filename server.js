
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

// Joueurs actuellement dans une partie
const players = new Map();

function cleanText(value, maxLength = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function gameRoom(game) {
  return "game:" + game.trim().toLowerCase();
}

function leaveCurrentGame(socket) {
  const player = players.get(socket.id);
  if (!player) return;

  const room = player.room;

  // Prévenir les autres joueurs de la même salle
  socket.to(room).emit("playerLeft", {
    id: socket.id
  });

  socket.leave(room);
  players.delete(socket.id);

  socket.data.game = null;
  socket.data.room = null;
}

io.on("connection", (socket) => {
  console.log("Connexion :", socket.id);

  // Rejoindre un jeu
  socket.on("joinGame", (data) => {
    if (!data) return;

    const username = cleanText(data.username, 20);
    const game = cleanText(data.game, 50);

    if (!username || !game) return;

    // Éviter de rester dans l'ancienne partie
    leaveCurrentGame(socket);

    const room = gameRoom(game);

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
    socket.data.room = room;

    socket.join(room);
    players.set(socket.id, player);

    // Envoyer les joueurs déjà présents dans CE jeu
    socket.emit(
      "players",
      [...players.values()]
        .filter(p => p.room === room && p.id !== socket.id)
        .map(({ room, ...p }) => p)
    );

    // Annoncer l'arrivée aux autres joueurs
    socket.to(room).emit("playerJoined", player);

    console.log(username, "a rejoint", game);
  });

  // Quitter le jeu et revenir au menu
  socket.on("leaveGame", () => {
    leaveCurrentGame(socket);
    console.log("Retour au menu :", socket.id);
  });

  // Déplacements
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

    socket.to(player.room).emit("playerMoved", {
      id: socket.id,
      x: player.x,
      y: player.y,
      z: player.z
    });
  });

  // Apparence du personnage
  socket.on("updateSkin", (skin) => {
    const player = players.get(socket.id);

    if (!player || !skin || typeof skin !== "object") {
      return;
    }

    player.skin = skin;

    socket.to(player.room).emit("skinUpdated", {
      id: socket.id,
      skin: player.skin
    });
  });

  // Chat : le serveur choisit le nom et la salle
  socket.on("sendChatMessage", (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;

    const message = cleanText(data.message, 300);
    if (!message) return;

    io.to(player.room).emit("chatMessage", {
      username: player.username,
      message,
      game: player.game,
      timestamp: Date.now()
    });
  });

  // Recherche parmi les joueurs actuellement en ligne
  socket.on("findOnlineAccount", (data, callback) => {
    const username = cleanText(data?.username, 20).toLowerCase();

    const found = [...players.values()].some(
      p => p.username.toLowerCase() === username
    );

    if (typeof callback === "function") {
      callback({ found });
    }
  });

  // Déconnexion
  socket.on("disconnect", () => {
    leaveCurrentGame(socket);
    console.log("Déconnexion :", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("BIBLOX prêt sur le port", PORT);
});
