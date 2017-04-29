'use strict';

const util  = require('../common/util');
const work = require('webworkify');

const SOCKET_SERVER = `${location.protocol}//${location.host}`
const BUFFER_SIZE = 1024;

module.exports = {
  el: '#jsPubApp',

  data: {
    _worker: null,
    _stream: null,
    _ctx:    null,

    noFilter: true,
    chName:   '1', // default

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
  },

  methods: {
    onMic() {
      if (this.state.isMicOn) { return; }

      navigator.getUserMedia(
        { audio: true },
        (stream) => {
          this._onMicStream(stream);
          this.startPub();
        },
        (err) => {
          console.error(err);
        }
      );
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

    toggleFilter() {
      if (!this.state.isPub) { return; }

      var audio = this.$data._audio;
      if (this.noFilter) {
        audio.source.disconnect();
        audio.source.connect(audio.processor);
      } else {
        audio.source.disconnect();
        audio.source.connect(audio.filter);
      }
    },

    startPub() {
      if (!this.state.isMicOn) { return; }
      if (this.state.isPub) { return; }

      this.state.isPub = true;
      this.$data._worker.postMessage({
        type: 'CH',
        data: this.chName
      });
    },

    stopPub() {
      if (!this.state.isPub) { return; }
      this.state.isPub = false;
    },

    _onMicStream: function(stream) {
      this.$data._stream = stream;
      this.state.isMicOn = true;

      var ctx = this.$data._ctx;
      var audio = this.$data._audio;

      // マイク
      audio.source = ctx.createMediaStreamSource(this.$data._stream);

      // 電話くらいの品質にしておく
      audio.filter = ctx.createBiquadFilter();
      audio.filter.type = 'bandpass';
      // アナログ電話は300Hz ~ 3.4kHz / ひかり電話は100Hz ~ 7kHz
      audio.filter.frequency.value = (100 + 7000) / 2;
      // 固定ならだいたい聴き良いのがこれくらい・・？
      audio.filter.Q.value = 0.25;

      // マイクレベル確認用
      audio.analyser = ctx.createAnalyser();
      audio.analyser.smoothingTimeConstant = 0.4;
      audio.analyser.fftSize = BUFFER_SIZE;

      // 音質には期待しないのでモノラルで飛ばす
      audio.processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      audio.processor.onaudioprocess = this._onAudioProcess;

      // 自分のフィードバックいらない
      audio.gain = ctx.createGain();
      audio.gain.gain.value = 0;

      audio.source.connect(audio.filter);
      audio.filter.connect(audio.processor);
      audio.processor.connect(audio.analyser);
      audio.processor.connect(audio.gain);
      audio.gain.connect(ctx.destination);
    },

    _onAudioProcess(ev) {
      var inputBuffer  = ev.inputBuffer;
      var outputBuffer = ev.outputBuffer;
      var inputData  = inputBuffer.getChannelData(0);
      var outputData = outputBuffer.getChannelData(0);

      // Bypassしつつ飛ばす
      outputData.set(inputData);
      if (this.state.isPub) {
        this.$data._worker.postMessage({
          type: 'AUDIO',
          data: { buf: outputData.buffer, ch: this.chName }
        });
      }
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
    }
  }
};
