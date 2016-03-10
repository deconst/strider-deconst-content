var path = require('path');
var util = require('util');

var entry = require('./lib/entry');

module.exports = {
  init: function (config, job, context, callback) {
    var isPullRequest = job.trigger.type === 'pull-request';

    callback(null, {
      env: {},
      path: [],

      test: function (context, done) {
        if (isPullRequest) {
          var opts = assembleOptions(config, context, job.trigger.url);

          opts.whisper('Testing pull request [%s].', opts.pullRequestURL);

          entry.preparePullRequest(opts, done);
        } else {
          done(null, false);
        }
      },

      deploy: function (context, done) {
        var opts = assembleOptions(config, context);

        entry.recursivelyPrepare(opts, done);
      }
    });
  }
};

var makeWriter = function (context) {
  return function () {
    var text = util.format.apply(null, arguments);

    if (text.substr(-1) !== '\n') {
      text += '\n';
    }

    context.out(text);
  };
};

var assembleOptions = function (config, context, pullRequestURL) {
  var write = makeWriter(context);

  var opts = {
    root: context.dataDir,
    dataContainer: process.env.STRIDER_WORKSPACE_CONTAINER,
    pullRequestURL: pullRequestURL,
    contentServiceURL: config.contentServiceURL,
    contentServiceAPIKey: config.contentServiceAPIKey,
    contentServiceTLSVerify: config.contentServiceTLSVerify,
    stagingContextServiceURL: config.stagingContentServiceURL,
    stagingContentServiceAdminAPIKey: config.stagingContentServiceAdminAPIKey,
    say: write,
    whisper: function () {}
  };

  if (config.verbose) {
    opts.whisper = write;
  }

  return opts;
}
