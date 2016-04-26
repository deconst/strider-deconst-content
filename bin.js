#!/usr/bin/env node

var util = require('util');
var entry = require('./lib/entry');

var toolbelt = {
  workspacePath: function () { return '.' }

  info: console.log,
  debug: console.log,
  error: console.error
};

entry.recursivelyPrepare(toolbelt, null, function (err) {
  if (err) {
    logging.logger.error("Preparation unsuccessful.", err);

    process.exit(1);
  }
});
