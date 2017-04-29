'use strict';
var io = require('socket.io-client');

module.exports = function(self) {
  var socket = null;

  self.addEventListener('message', function(ev) {
    var payload = ev.data;
    switch (payload.type) {
    case 'INIT':
      socket = io(payload.data.SOCKET_SERVER);

      // "sub:joined" is an event which comes from a backend server
      // when a new subscriber is **joined** to the belonging channel.
      socket.on("sub:joined", (socketId) => {
        self.postMessage({ type: "sub:joined", data: socketId });
      });

      // "sub:left" is an event which comes from a backend server
      // when a new subscriber is **left** from the belonging channel.
      socket.on("sub:left", (socketId) => {
        self.postMessage({ type: "sub:left", data: socketId });
      });

      break;
    case 'CH':
      socket.emit('pub:ch', payload.data);
      break;
    case 'AUDIO_ON':
      socket.on('audio', __handleAudioBufferMsg);
      break;
    case 'AUDIO_OFF':
      socket.off('audio', __handleAudioBufferMsg);
      break;
    case 'AUDIO':
      socket.emit('audio', payload.data);
      break;
    }
  });

  function __handleAudioBufferMsg(buf) {
    console.log(buf)

    self.postMessage({ type: 'audio', data: buf });
  }
};
