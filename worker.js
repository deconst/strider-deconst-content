var path = require('path');
var util = require('util');

var entry = require('./lib/entry');

module.exports = {
  init: function (config, job, context, callback) {
    callback(null, {
      env: {},
      path: [],

      deploy: function (context, done) {
        var write = function () {
          var text = util.format.apply(null, arguments);

          if (text.substr(-1) !== '\n') {
            text += '\n';
          }

          context.out(text);
        };

        var opts = {
          root: context.dataDir,
          dataContainer: process.env.STRIDER_WORKSPACE_CONTAINER,
          contentServiceURL: config.contentServiceURL,
          contentServiceAPIKey: config.contentServiceAPIKey,
          contentServiceTLSVerify: config.contentServiceTLSVerify,
          say: write,
          whisper: function () {}
        };

        if (config.verbose) {
          opts.whisper = write;
        }

        entry.recursivelyPrepare(opts, done);
      }
    });
  }
};
