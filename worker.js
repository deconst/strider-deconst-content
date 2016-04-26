var util = require('util');

var Toolbelt = require('strider-deconst-common').Toolbelt;

var entry = require('./lib/entry');

module.exports = {
  init: function (config, job, jobContext, callback) {
    callback(null, {
      env: {},
      path: [],

      test: function (phaseContext, done) {
        var toolbelt = new Toolbelt(config, job, jobContext, phaseContext);
        if (toolbelt.isPullRequest) {
          toolbelt.debug('Testing pull request %s.', toolbelt.pullRequestURL);
          toolbelt.connectToDocker();

          entry.preparePullRequest(toolbelt, function (err, results) {
            if (err) {
              err.type = 'exitCode';
              err.code = 1;
            }

            done(err, results.didSomething);
          })
        } else {
          done(null, false);
        }
      },

      deploy: function (context, done) {
        var toolbelt = new Toolbelt(config, job, jobContext, phaseContext);
        toolbelt.connectToDocker();

        entry.recursivelyPrepare(toolbelt, null, function (err, results) {
          if (err) {
            err.type = 'exitCode';
            err.code = 1;
          }

          done(err, results.didSomething);
        })
      }
    })
  }
}

var makeWriter = function (context) {
  return function () {
    var text = util.format.apply(null, arguments);

    if (text.substr(-1) !== '\n') {
      text += '\n';
    }

    context.out(text);
  };
};
