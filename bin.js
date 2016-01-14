#!/usr/bin/env node

var logging = require('./lib/logger');
var entry = require('./lib/entry');

var opts = {
  root: ".",
  say: logging.say,
  whisper: logging.whisper
};

entry.recursivelyPrepare(opts, function (err) {
  if (err) {
    logging.logger.error("Preparation unsuccessful.", err);

    process.exit(1);
  }
});
