'use strict';

var Vue = require('vue');
var subApp = require('./app');

require('../common/polyfill').polyfill();

new Vue(subApp);
