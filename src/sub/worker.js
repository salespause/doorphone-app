'use strict';
var io = require('socket.io-client');

module.exports = function(self) {
  var socket = null;

  self.addEventListener('message', function(e) {
    const payload = e.data;

    switch (payload.type) {
    case 'INIT':
      _init(payload.data);
      break;
    case 'SUB_JOIN': // Execute joining to the channel
      socket.emit('sub:join', payload.data);
      break;
    case 'SUB_LEAVE':
      socket.emit('sub:leave', payload.data);
      break;
    case 'AUDIO_ON':
      socket.on('audio', __handleAudioBufferMsg);
      break;
    case 'AUDIO_OFF':
      socket.off('audio', __handleAudioBufferMsg);
      break;
    case 'AUDIO': // Send audio
      socket.emit('audio', payload.data);
      break;
    }
  });

  function _init(data) {
    socket = io(data.SOCKET_SERVER);

    // This "ch" event is triggered when a list of channels
    // is updated in the server.
    socket.on('ch', function(ch) {
      self.postMessage({ type: 'ch', data: ch });
    });

    socket.on('delCh', function() {
      self.postMessage({ type: 'delCh', data: null });
    });

    // Registering a subscriber to the server
    socket.emit('sub:connect');
  }

  function __handleAudioBufferMsg(buf) {
    self.postMessage({ type: 'audio', data: buf });
  }
};

