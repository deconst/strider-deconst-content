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

/*
 * Infer a preparer container for content at a content location. Execute the container, reporting
 * all output to the build. Invoke the callback with the execution status when the preparer is
 * complete.
 *
 * opts.contentRoot - Root directory of the content to prepare.
 * opts.contentServiceURL - Content service URL as a content destination.
 * opts.contentServiceAPIKey - API key valid for the content service.
 * opts.revisionID - (optional) revision ID for this staging build. If provided, the content ID base
 *   from _deconst.json will be mangled to submit staging content.
 */
exports.prepare = function (toolbelt, opts, callback) {
  var contentIDBase = null;
  var preparer = null;

  var docker = toolbelt.docker;

  var readConfiguration = function (cb) {
    var filename = path.join(opts.contentRoot, '_deconst.json');

    fs.readFile(filename, { encoding: 'utf-8' }, function (err, contents) {
      var config = {};
      try {
        config = JSON.parse(contents);
      } catch (e) {
        toolbelt.error('Unable to parse _deconst.json file in %s', filename);
        return cb(new Error('Unable to parse _deconst.json'));
      }

      if (opts.revisionID) {
        if (config.contentIDBase) {
          contentIDBase = config.contentIDBase;

          // Prepend the revision ID as the first path segment of the content ID.
          var u = url.parse(contentIDBase);

          var parts = u.pathname.split('/');
          while (parts[0] === '') {
            parts.shift();
          }
          parts.unshift(opts.revisionID);
          u.pathname = '/' + parts.join('/');

          contentIDBase = url.format(u);
          toolbelt.debug('Revised content ID base: [%s]', contentIDBase);
        } else {
          toolbelt.error('No content ID base found in %s', filename);
          return cb(new Error('No content ID base found in _deconst.json'));
        }
      }

      if (config.preparer) {
        // Ensure that the preparer is in the whitelist
        if (preparerWhitelist.indexOf(config.preparer) === -1) {
          return cb(new Error('Preparer container ' + config.preparer + ' is not on the whitelist'));
        }

        preparer = config.preparer;
        toolbelt.info('Using configured preparer: %s', preparer);
        cb(null);
      } else {
        // Infer from directory contents
        heuristic.guessPreparer(opts.contentRoot, function (err, p) {
          if (err) return cb(err);

          preparer = p;
          toolbelt.info('Using inferred preparer: %s', preparer);
          cb(null);
        });
      }
    });
  };

  var runPreparer = function (cb) {
    var env = [
      'CONTENT_STORE_URL=' + opts.contentServiceURL,
      'CONTENT_STORE_APIKEY=' + opts.contentServiceAPIKey,
      'TRAVIS_PULL_REQUEST=false'
    ];

    if (toolbelt.config.contentServiceTLSVerify === false) {
      env.push('CONTENT_STORE_TLS_VERIFY=false');
    }

    if (contentIDBase) {
      env.push('CONTENT_ID_BASE=' + contentIDBase);
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
      var bind = opts.contentRoot + ":" + containerPath;

      params.Mounts = [{
        Source: opts.contentRoot,
        Destination: containerPath,
        Mode: "rw",
        RW: true
      }];
      params.HostConfig.Binds = [bind];
    }

    docker.runContainer(params, cb);
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
