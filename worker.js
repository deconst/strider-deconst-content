var path = require('path');
var util = require('util');

var entry = require('./lib/entry');

module.exports = {
  init: function (config, job, context, callback) {
    callback(null, {
      env: {},
      path: [],

      deploy: function (context, done) {
        var opts = {
          root: context.dataDir,
          say: function () {
            var text = util.format.apply(null, arguments);
            context.striderMessage(text);
          },
          whisper: function () {}
        };

        if (config.verbose) {
          opts.whisper = function () {
            var text = util.format.apply(null, arguments);
            context.striderMessage(">> " + text);
          };
        }

        entry.recursivelyPrepare(opts, done);
      }
    });
  }
};
