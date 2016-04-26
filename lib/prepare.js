var fs = require('fs');
var path = require('path');
var url = require('url');
var async = require('async');

var heuristic = require('./heuristic');

var preparerWhitelist = (function () {
  var whitelist = process.env.DECONST_BUILD_WHITELIST;

  if (whitelist) {
    return whitelist.split(/\s*,\s*/);
  } else {
    return [
      "quay.io/deconst/preparer-sphinx",
      "quay.io/deconst/preparer-jekyll"
    ];
  }
})();

exports.prepare = function (toolbelt, contentRoot, revisionID, callback) {
  var contentIDBase = null;
  var preparer = null;

  var readConfiguration = function (cb) {
    var filename = path.join(contentRoot, '_deconst.json');

    fs.readFile(filename, { encoding: 'utf-8' }, function (err, contents) {
      var config = {};
      try {
        config = JSON.parse(contents);
      } catch (e) {
        toolbelt.error('Unable to parse _deconst.json file in %s', filename);
        return callback(new Error('Unable to parse _deconst.json'));
      }

      if (revisionID) {
        if (config.contentIDBase) {
          contentIDBase = config.contentIDBase;

          // Prepend the revision ID as the first path segment of the content ID.
          var u = url.parse(contentIDBase);

          var parts = u.pathname.split('/');
          while (parts[0] === '') {
            parts.shift();
          }
          parts.unshift(revisionID);
          u.pathname = '/' + parts.join('/');

          contentIDBase = url.format(u);
          toolbelt.debug('Revised content ID base: [%s]', contentIDBase);
        } else {
          toolbelt.error('No content ID base found in %s', filename);
          return callback(new Error('No content ID base found in _deconst.json'));
        }
      }

      if (config.preparer) {
        // Ensure that the preparer is in the whitelist
        if (preparerWhitelist.indexOf(config.preparer) === -1) {
          return callback(new Error('Preparer container ' + config.preparer + ' is not on the whitelist'));
        }

        preparer = config.preparer;
        toolbelt.info('Using configured preparer: %s', preparer);
        callback(null);
      } else {
        // Infer from directory contents
        heuristic.guessPreparer(contentRoot, function (err, p) {
          if (err) return callback(err);

          preparer = p;
          toolbelt.info('Using inferred preparer: %s', preparer);
          callback(null);
        });
      }
    });
  };

  var runPreparer = function (callback) {
    var env = [
      'CONTENT_STORE_URL=' + toolbelt.config.contentServiceURL,
      'CONTENT_STORE_APIKEY=' + toolbelt.config.contentServiceAPIKey,
      'TRAVIS_PULL_REQUEST=false'
    ];

    if (toolbelt.config.contentServiceTLSVerify === false) {
      env.push('CONTENT_STORE_TLS_VERIFY=false');
    }

    if (toolbelt.config.contentIDBase) {
      env.push('CONTENT_ID_BASE=' + toolbelt.config.contentIDBase);
    }

    var params = {
      Image: preparer,
      Env: env,
      HostConfig: {}
    };

    if (toolbelt.workspaceContainerRoot()) {
      params.HostConfig.VolumesFrom = [toolbelt.workspaceContainerRoot()];
      params.Env.push("CONTENT_ROOT=" + contentRoot);
    } else {
      var containerPath = '/usr/content-repo';
      var bind = contentRoot + ":" + containerPath;

      params.Mounts = [{
        Source: contentRoot,
        Destination: containerPath,
        Mode: "rw",
        RW: true
      }];
      params.HostConfig.Binds = [bind];
    }
  }

  async.series([
    readConfiguration,
    runPreparer
  ], function (err, results) {
    var result = { contentIDBase: contentIDBase };

    if (err) {
      toolbelt.error("Preparer completed with an error.", err);
      result.success = false;
      return callback(err, result);
    }

    toolbelt.info("Preparer completed.", {
      status: results[1].status
    });

    result.success = results[1].status === 0;
    callback(null, result);
  });
};
