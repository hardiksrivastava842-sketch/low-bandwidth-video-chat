const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain",
  });

  res.end("Signaling server is running");
});

const wss = new WebSocket.Server({
  server,
});

const rooms = new Map();

console.log(`Starting signaling server on port ${PORT}`);

wss.on("connection", (socket) => {
  let currentRoom = null;

  socket.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "join") {
        currentRoom = data.room;

        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, new Set());
        }

        const room = rooms.get(currentRoom);

        room.add(socket);

        console.log(`User joined room: ${currentRoom}`);

        room.forEach((client) => {
          if (client !== socket) {
            client.send(
              JSON.stringify({
                type: "user-joined",
              })
            );
          }
        });

        return;
      }

      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom);

        room.forEach((client) => {
          if (client !== socket) {
            client.send(JSON.stringify(data));
          }
        });
      }
    } catch (error) {
      console.error("Message error:", error);
    }
  });

  socket.on("close", () => {
    if (!currentRoom) return;

    const room = rooms.get(currentRoom);

    if (!room) return;

    room.delete(socket);

    if (room.size === 0) {
      rooms.delete(currentRoom);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Signaling server running on port ${PORT}`);
});