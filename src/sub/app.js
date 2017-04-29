'use strict';

const util  = require('../common/util');
const work = require('webworkify');

const SOCKET_SERVER = `${location.protocol}//${location.host}`
const BUFFER_SIZE = 1024;

module.exports = {
  el: '#jsSubApp',

  data: {
    _ctx:    null,
    _worker: null,

    _startTime: 0,

    ch:     {},
    volume: 50,

    chName: '1',     // default
    chExchange: '2', // exchange

    _audio: {
      gain: null
    },

    _watch: {
      volume: null
    },

    state: {
      isSub: false,
      isPublisherReady: false
    }
  },

  computed: {
    hasCh() {
      return Object.keys(this.ch).length !== 0;
    },

    uv4lHost() {
      const _params = new URLSearchParams(location.search);
      const _host = _params.get("h");
      return `${_host}/stream/video.h264`
    }
  },

  events: {
    'hook:created'() {
      this.$data._ctx = new window.AudioContext();
      this.$data._worker = work(require('./worker.js'));
      this.$data._worker.addEventListener('message', this._handleWorkerMsg);
      this.$data._worker.postMessage({
        type: 'INIT',
        data: { SOCKET_SERVER }
      });
    }
  },

  methods: {
    startSub() {
      if (this.state.isSub) { return; }

      // Execute joining to the channel
      this.$data._worker.postMessage({
        type: 'SUB_JOIN',
        data: this.chName
      });

      this._readyAudio();
      this.state.isSub = true;
    },

    stopSub() {
      if (!this.state.isSub) { return; }

      this.$data._worker.postMessage({
        type: 'SUB_LEAVE',
        data: this.chName
      });

      this._resetAudio();
      this.state.isSub = false;
    },

    _handleAudioBuffer(buf) {
      var ctx = this.$data._ctx;
      var audio = this.$data._audio;
      var f32Audio = new Float32Array(buf);
      var audioBuffer = ctx.createBuffer(1, BUFFER_SIZE, ctx.sampleRate);
      audioBuffer.getChannelData(0).set(f32Audio);

      var source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audio.gain);

      var currentTime = ctx.currentTime;
      if (currentTime < this.$data._startTime) {
        source.start(this.$data._startTime);
        this.$data._startTime += audioBuffer.duration;
      } else {
        source.start(this.$data._startTime);
        this.$data._startTime = currentTime + audioBuffer.duration;
      }
    },

    _handleWorkerMsg(e) {
      const payload = e.data;

      switch (payload.type) {
      case 'ch':
        // Update the available channel list
        // and here also indicates the status of publishe if he's ready or not
        this.$data.ch = payload.data;

        if (this.$data.ch["1"]) {
          this.$data.state.isPublisherReady = true
        }

        break;
      case 'audio':
        this._handleAudioBuffer(payload.data);
        break;
      case 'delCh':
        location.reload();
        break;
      }
    },

    _readyAudio() {
      var ctx = this.$data._ctx;
      var audio = this.$data._audio;
      audio.gain = ctx.createGain();
      audio.gain.gain.value = this.volume;
      audio.gain.connect(ctx.destination);

      this.$data._watch.volume = this.$watch('volume', this._onChangeVolume);
    },

    _resetAudio() {
      util.disconnectAll(this.$data._audio);
      util.unwatchAll(this.$data._watch);
    },

    _onChangeVolume(val) {
      this.$data._audio.gain.gain.value = val;
    }
  }
};
