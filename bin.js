#!/usr/bin/env node

var logging = require('./lib/logger');
var job = require('./lib/job');

var opts = {
  root: ".",
  say: logging.say,
  whisper: logging.whisper
};

job.recursivelyPrepare(opts, function (err) {
  if (err) {
    logging.logger.error("Preparation unsuccessful.", err);

    process.exit(1);
  }
});
