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
    _stream: null,
    _startTime: 0,

    ch:     {},
    volume: 50,

    chName: '1',     // default
    chExchange: '2', // exchange

    _audio:  {
      source:    null,
      processor: null,
      filter:    null,
      analyser:  null,
      gain:      null
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

      // Start publishing
      navigator.getUserMedia({ audio: true }, (stream) => {
        this._onMicStream(stream);
        this.state.isPub = true;

        this.$data._worker.postMessage({ type: 'SUB_JOIN', data: this.chName });
        this.$data._worker.postMessage({ type: 'SUB_JOIN', data: this.chExchange });
        this.$data._worker.postMessage({ type: 'AUDIO_ON' });

        this._readyAudio();
        this.state.isSub = true;

        //
        // Send a voice data
        //

      }, (err) => {
        console.error(err);
      });
    },

    stopSub() {
      if (!this.state.isSub) { return; }

      this.$data._worker.postMessage({ type: 'SUB_LEAVE', data: this.chName });
      this.$data._worker.postMessage({ type: 'SUB_LEAVE', data: this.chExchange });
      this.$data._worker.postMessage({ type: 'AUDIO_OFF' });

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
    },

    _resetAudio() {
      util.disconnectAll(this.$data._audio);
    },

    _onChangeVolume(val) {
      this.$data._audio.gain.gain.value = val;
    },

    //
    // Set up a mic
    //
    _onMicStream: function(stream) {
      this.$data._stream = stream;
      this.state.isMicOn = true;

      const ctx = this.$data._ctx;
      const audio = this.$data._audio;

      audio.source = ctx.createMediaStreamSource(this.$data._stream);

      audio.filter = ctx.createBiquadFilter();
      audio.filter.type = 'bandpass';
      audio.filter.frequency.value = (100 + 7000) / 2;
      audio.filter.Q.value = 0.25;

      audio.analyser = ctx.createAnalyser();
      audio.analyser.smoothingTimeConstant = 0.4;
      audio.analyser.fftSize = BUFFER_SIZE;

      audio.processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      audio.processor.onaudioprocess = this._onAudioProcess;

      audio.gain = ctx.createGain();
      audio.gain.gain.value = 0;

      audio.source.connect(audio.filter);
      audio.filter.connect(audio.processor);
      audio.processor.connect(audio.analyser);
      audio.processor.connect(audio.gain);
      audio.gain.connect(ctx.destination);
    },

    //
    // The handler of onaudioprocess to send an audio to channel
    //
    _onAudioProcess(ev) {
      const inputBuffer  = ev.inputBuffer;
      const outputBuffer = ev.outputBuffer;
      const inputData  = inputBuffer.getChannelData(0);
      const outputData = outputBuffer.getChannelData(0);

      // Bypassしつつ飛ばす
      outputData.set(inputData);
      if (this.state.isPub) {
        this.$data._worker.postMessage({
          type: 'AUDIO',
          data: { buf: outputData.buffer, ch: this.chExchange }
        });
      }
    },
  }
};
