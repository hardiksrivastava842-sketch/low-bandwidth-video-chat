const WebSocket = require("ws");

const wss = new WebSocket.Server({
  port: 8080,
});

const rooms = new Map();

console.log("Signaling server running on ws://localhost:8080");

wss.on("connection", (socket) => {
  let currentRoom = null;

  socket.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      // Join room
      if (data.type === "join") {
        currentRoom = data.room;

        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, new Set());
        }

        const room = rooms.get(currentRoom);

        room.add(socket);

        console.log(
          `User joined room: ${currentRoom}`
        );

        // Tell existing users that someone joined
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

      // Forward WebRTC messages
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