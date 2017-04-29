'use strict';

var Vue = require('vue');
var pubApp = require('./app');

require('../common/polyfill').polyfill();

new Vue(pubApp);
