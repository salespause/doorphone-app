'use strict';

const util  = require('../common/util');
const work = require('webworkify');

const SOCKET_SERVER = `${location.protocol}//${location.host}`
const BUFFER_SIZE = 1024;

module.exports = {
  el: '#jsPubApp',

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
      isMicOn: false,
      isPub:   false,

      isSubscriberJoined: false
    }
  },

  events: {
    'hook:created': function() { this._hookCreated(); }
  },

  ready() {
    this.onMic();
    this.sendNotification();
  },

  methods: {
    sendNotification() {
      const http = new XMLHttpRequest();
      http.open("get", SOCKET_SERVER + "/notify/all", true);
      http.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
      http.setRequestHeader("auth-secret", "dekitango");
      http.send();
    },

    onMic() {
      if (this.state.isMicOn) { return; }

      navigator.getUserMedia({ audio: true }, (stream) => {
        this._onMicStream(stream);
        this.startPub();
      }, (err) => {
        console.error(err);
      });
    },

    offMic() {
      if (!this.state.isMicOn) { return; }

      this.$data._stream.getTracks().forEach(function(t) { t.stop(); });
      this.$data._stream = null;
      this.state.isMicOn = false;
      util.disconnectAll(this.$data._audio);
      cancelAnimationFrame(this._drawInputSpectrum);
      this.stopPub();
    },

    startPub() {
      if (!this.state.isMicOn || this.state.isPub) { return; }
      this.$data._worker.postMessage({ type: 'CH', data: this.chName });
      this.$data._worker.postMessage({ type: 'CH', data: this.chExchange });
      this.$data._worker.postMessage({ type: 'AUDIO_ON' });
      this._readyAudio();
      this.state.isPub = true;
    },

    stopPub() {
      if (!this.state.isPub) { return; }
      this.state.isPub = false;
    },

    _drawInputSpectrum() {
      if (!this.$data._audio.analyser) { return; }

      var analyser = this.$data._audio.analyser;
      var fbc = analyser.frequencyBinCount;
      var freqs = new Uint8Array(fbc);
      analyser.getByteFrequencyData(freqs);

      var $canvas = this.$els.canvas;
      var drawContext = $canvas.getContext('2d');

      drawContext.clearRect(0, 0, $canvas.width, $canvas.height);
      for (var i = 0; i < freqs.length; i++) {
        var barWidth = $canvas.width / fbc;
        // 0 - 255の値が返るのでそれを使って描画するバーの高さを得る
        var height = $canvas.height * (freqs[i] / 255);
        var offset = $canvas.height - height;
        drawContext.fillStyle = 'hsl(' + (i / fbc * 360) + ', 100%, 50%)';
        drawContext.fillRect(i * barWidth, offset, barWidth + 1, height);
      }

      requestAnimationFrame(this._drawInputSpectrum);
    },

    _hookCreated() {
      this.$data._ctx = new window.AudioContext();
      this.$data._worker = work(require('./worker.js'));

      // Set up a handler to get messages from WebWorker
      this.$data._worker.addEventListener('message', (e) => {
        const payload = e.data;

        switch (e.data.type) {
          case "sub:joined":
            console.log("joined!");

            this.$data.state.isSubscriberJoined = true;
            this.$nextTick(() => {
              this._setupSpectrumCanvas();
              this._drawInputSpectrum();
            });

            break;
          case "sub:left":
            console.log("left!");
            location.href = "/app";
            break;
          case "audio":
            this._handleAudioBuffer(payload.data);
            break;
        }
      });

      this.$data._worker.postMessage({
        type: 'INIT',
        data: { SOCKET_SERVER }
      });
    },

    _setupSpectrumCanvas() {
      var $canvas = this.$els.canvas;
      $canvas.width = window.innerWidth * 2;
      $canvas.height = $canvas.width / 10;
      $canvas.style.width  = '50%';
      $canvas.style.height = '10%';
      $canvas.style.backgroundColor = "grey";
    },

    //
    // ready audio
    //
    _readyAudio() {
      var ctx = this.$data._ctx;
      var audio = this.$data._audio;
      audio.gain = ctx.createGain();
      audio.gain.gain.value = this.volume;
      audio.gain.connect(ctx.destination);
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
    // onaudioproces handler to send an audio to channel
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
          data: { buf: outputData.buffer, ch: this.chName }
        });
      }
    },

    //
    // Set up an output audio
    //
    _handleAudioBuffer(buf) {
      const ctx = this.$data._ctx;
      const audio = this.$data._audio;
      const f32Audio = new Float32Array(buf);
      const audioBuffer = ctx.createBuffer(1, BUFFER_SIZE, ctx.sampleRate);
      const source = ctx.createBufferSource();

      audioBuffer.getChannelData(0).set(f32Audio);

      source.buffer = audioBuffer;
      source.connect(audio.gain);

      const currentTime = ctx.currentTime;
      if (currentTime < this.$data._startTime) {
        source.start(this.$data._startTime);
        this.$data._startTime += audioBuffer.duration;
      } else {
        source.start(this.$data._startTime);
        this.$data._startTime = currentTime + audioBuffer.duration;
      }
    },
  }
};
