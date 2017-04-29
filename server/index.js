'use strict';

const express = require("express");
const app = express();
const server = require('http').Server(app);
const io = require('socket.io').listen(server);

// The list of subscribers
let sub = Object.create({});

// The list of available channels
let ch  = Object.create({});

app.use("/app", express.static("dist"))

io.on('connection', (socket) => {
  let socketId = socket.id;
  console.log(`user connected -> id: ${socketId}`);

  update();

  // This event probably creates the channel with the name
  // given as "chName" and join the channel.
  socket.on('pub:ch', (chName) => {
    ch[chName] = socketId;
    update();
    socket.join(chName);
    console.log(`Pub: ${socketId} create #${chName}`);
  });

  // Registers a subscriber
  socket.on('sub:connect', () => {
    sub[socketId] = 1;
    update();
  });

  // Joining to the channel of "chName"
  socket.on('sub:join', (chName) => {
    socket.join(chName);

    // Emit a notification of the socket joined
    socket.to(chName).emit("sub:joined", socketId);

    console.log(`Sub: ${socketId} join to #${chName}`);
  });

  socket.on('sub:leave', (chName) => {
    socket.leave(chName);

    // Emit a notification of the socket leaved
    socket.to(chName).emit("sub:left", socketId);

    console.log(`Sub: ${socketId} leave #${chName}`);
  });

  socket.on('audio', (data) => {
    socket.to(data.ch).emit('audio', data.buf);
  });

  socket.on('disconnect', () => {
    console.log(`user disconnected -> id: ${socketId}`);
    if (socketId in sub) {
      delete sub[socketId];
    } else {
      Object.keys(ch).forEach((chName) => {
        if (ch[chName] === socketId) {
          socket.to(chName).emit('delCh');
          delete ch[chName];
        }
      });
    }

    update();
  });

  // "ch" has a list of channels.
  // This method sends the ilist data to all clients.
  function update() {
    console.log(`Ch:`, ch);
    socket.emit('ch', ch);
    socket.broadcast.emit('ch', ch);
  }
});

app.get("/", (req, res) => {
  res.send("Hello");
});

const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`listening on *:${port}`);
});
