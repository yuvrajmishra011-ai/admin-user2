const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const ROOM_NAME = "veristream-session";

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    console.log(`[signaling] 🟢 Connection established: ${socket.id}`);

    socket.on("join", (data) => {
      const { role } = data;
      socket.join(ROOM_NAME);
      socket.role = role; // attach for disconnect logging
      
      console.log(`[signaling] 👤 ${role.toUpperCase()} connected (${socket.id})`);

      if (role === "admin") {
        console.log(`[signaling] ⚡ Admin joined, requesting offer from clients...`);
        socket.to(ROOM_NAME).emit("request-offer");
      } else if (role === "client" || role === "client-metrics") {
        const room = io.sockets.adapter.rooms.get(ROOM_NAME);
        if (room && room.size > 1) {
          console.log(`[signaling] ⚡ Client joined, broadcasting request-offer...`);
          socket.emit("request-offer");
        }
      }
    });

    socket.on("request-offer", () => {
      console.log(`[signaling] 🔁 Relaying manual request-offer...`);
      socket.to(ROOM_NAME).emit("request-offer");
    });

    socket.on("signal", (msg) => {
      console.log(`[signaling] 📡 Relaying ${msg.type.toUpperCase()} from ${msg.sender}`);
      socket.to(ROOM_NAME).emit("signal", msg);
    });

    socket.on("metrics", (packet) => {
      socket.to(ROOM_NAME).emit("metrics", packet);
    });

    socket.on("disconnect", () => {
      const roleText = socket.role ? socket.role.toUpperCase() : "UNKNOWN";
      console.log(`[signaling] 🔴 ${roleText} disconnected: ${socket.id}`);
      if (socket.role === "client") {
        socket.to(ROOM_NAME).emit("client-disconnected");
      }
    });
  });

  httpServer.once("error", (err) => {
    console.error(err);
    process.exit(1);
  });

  httpServer.listen(port, hostname, () => {
    console.log(`\n🚀 VeriStream Unified Server (HTTP + WS)`);
    console.log(`   Running on http://${hostname}:${port}`);
    console.log(`   Session Room: ${ROOM_NAME}\n`);
  });
});
