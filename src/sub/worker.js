'use strict';
var io = require('socket.io-client');

module.exports = function(self) {
  var socket = null;

  self.addEventListener('message', function(ev) {
    var payload = ev.data;
    switch (payload.type) {
    case 'INIT':
      _init(payload.data);
      break;
    case 'SUB_JOIN': // Execute joining to the channel
      _subJoin(payload.data);
      break;
    case 'SUB_LEAVE':
      _subLeave(payload.data);
      break;
    }
  });

  function _init(data) {
    socket = io(data.SOCKET_SERVER);

    // This "ch" event is triggered when a list of channels
    // is updated in the server.
    socket.on('ch', function(ch) {
      self.postMessage({
        type: 'ch',
        data: ch
      });
    });

    socket.on('delCh', function() {
      self.postMessage({
        type: 'delCh',
        data: null
      });
    });

    // Registering a subscriber to the server
    socket.emit('sub:connect');
  }

  function _subJoin(data) {
    socket.emit('sub:join', data);
    socket.on('audio', __handleAudioBufferMsg);
  }

  function _subLeave(data) {
    socket.emit('sub:leave', data);
    socket.off('audio', __handleAudioBufferMsg);
  }

  function __handleAudioBufferMsg(buf) {
    self.postMessage({
      type: 'audio',
      data: buf
    });
  }
};

