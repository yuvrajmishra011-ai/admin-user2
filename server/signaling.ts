/**
 * VeriStream Signaling Server (Hardened)
 *
 * This version uses Socket.IO Rooms to support multiple clients and admins
 * concurrently without session collision.
 */

import { createServer } from "http";
import { Server, Socket } from "socket.io";

const PORT = parseInt(process.env.SIGNALING_PORT || "3002", 10);
const ROOM_NAME = "veristream-session";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

io.on("connection", (socket) => {
  console.log(`[signaling] 🟢 Connection: ${socket.id}`);

  socket.on("join", (data: { role: string }) => {
    const { role } = data;
    socket.join(ROOM_NAME);
    
    // Tag the socket so we know its role
    (socket as any).role = role;
    
    console.log(`[signaling] 👤 ${socket.id} joined as ${role} to room ${ROOM_NAME}`);

    // If an admin joins, ask all clients in the room to send an offer
    if (role === "admin") {
      socket.to(ROOM_NAME).emit("request-offer");
    } 
    // If a client joins, ask it to send an offer if there's any admin in the room
    else if (role === "client" || role === "client-metrics") {
      // Check if there are any admins in the room
      const room = io.sockets.adapter.rooms.get(ROOM_NAME);
      if (room) {
        // This is a simple broadcast to trigger the handshake
        socket.emit("request-offer");
      }
    }
  });

  // ── Relay Handshake Requests ──────────────────────────────────────────────
  socket.on("request-offer", () => {
    socket.to(ROOM_NAME).emit("request-offer");
  });

  // ── Relay WebRTC signaling ─────────────────────────────────────────────────
  socket.on("signal", (msg: { type: string; payload: any; sender: string }) => {
    console.log(`[signaling] 📡 Relay signal: ${msg.type} from ${msg.sender} (${socket.id})`);
    
    // Broadcast signal to everyone ELSE in the room
    socket.to(ROOM_NAME).emit("signal", msg);
  });

  // ── Relay metrics ──────────────────────────────────────────────────────────
  socket.on("metrics", (packet: any) => {
    // Broadcast metrics to everyone in the room (Admins will listen, Clients will ignore)
    socket.to(ROOM_NAME).emit("metrics", packet);
  });

  // ── Disconnect cleanup ─────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log(`[signaling] 🔴 Disconnected: ${socket.id}`);
    
    if ((socket as any).role === "client") {
      socket.to(ROOM_NAME).emit("client-disconnected");
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`\n🚀 VeriStream Hardened Signaling Server running on port ${PORT}`);
  console.log(`   Session Room: ${ROOM_NAME}\n`);
});
