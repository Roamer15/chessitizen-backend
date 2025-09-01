import { io } from "socket.io-client";

// simulate two players
const player1 = io("http://localhost:3000", {
  auth: { token: "JWT_TOKEN_FOR_PLAYER1" }
});

const player2 = io("http://localhost:3000", {
  auth: { token: "JWT_TOKEN_FOR_PLAYER2" }
});

player1.on("connect", () => {
  console.log("Player1 connected");

  // player1 creates a multiplayer game
  player1.emit("startGame", { isMultiplayer: true });
});

player1.on("gameWaiting", (data) => {
  console.log("Game waiting:", data);

  // player2 joins after game created
  player2.emit("joinMultiplayerGame", data.gameId);
});

player1.on("gameStarted", (game) => {
  console.log("Game started (P1):", game);

  // P1 makes a move
  player1.emit("makeMove", {
    gameId: game._id,
    dto: { from: "e2", to: "e4" }
  });
});

player2.on("playerJoined", (data) => {
  console.log("P2 joined:", data);
});

player2.on("gameStarted", (game) => {
  console.log("Game started (P2):", game);

  // P2 makes a move after P1
  player2.emit("makeMove", {
    gameId: game._id,
    dto: { from: "e7", to: "e5" }
  });
});

[player1, player2].forEach(p => {
  p.on("moveMade", (data) => {
    console.log("Move made:", data);
  });

  p.on("gameEnded", (data) => {
    console.log("Game ended:", data);
  });

  p.on("disconnect", () => console.log("Disconnected"));
});
