var async = require('async');
var util = require('util');
var path = require('path');
var walk = require('walk');
var request = require('request');
var childProcess = require('child_process');
var urlJoin = require('url-join');

var prepare = require('./prepare');
var comment = require('./comment');

/*
 * Recursively prepare all content roots within the build workspace.
 *
 * opts.revisionID - (optional) If specified, mangle content IDs to submit staging content.
 * opts.contentServiceURL - Content service to submit content to.
 * opts.contentServiceAPIKey - API key valid for the content service.
 */
var recursivelyPrepare = exports.recursivelyPrepare = function (toolbelt, opts, callback) {
  // walk the filesystem from . to find directories that contain a _deconst.json file.
  var options = { followLinks: false };

  var atLeastOne = false;
  var allSuccessful = true;
  var contentIDMap = {};

  walker = walk.walk(toolbelt.workspacePath(), options);

  walker.on('directories', function (root, stats, callback) {
    toolbelt.debug('Traversing directories: %s', root);

    // Don't traverse into dot or common build directories.
    for (var i = stats.length; i--; i >= 0) {
      var name = stats[i].name;
      if (/^\./.test(name) || name === '_build' || name === '_site') {
        stats.splice(i, 1);
      }
    }

    callback();
  });

  walker.on('files', function (root, stats, callback) {
    var hasContent = stats.some(function (each) {
      return each.name === '_deconst.json';
    });

    if (hasContent) {
      toolbelt.info('Deconst content directory: %s', root);

      opts.contentRoot = root;

      prepare.prepare(toolbelt, opts, function (err, results) {
        atLeastOne = true;

        if (err) {
          allSuccessful = false;
          return callback(err);
        }

        var relativeRoot = path.relative(toolbelt.workspacePath(), root);

        allSuccessful = allSuccessful && results.success;
        contentIDMap[relativeRoot] = results.contentIDBase;
        callback(null);
      });
    } else {
      callback(null);
    }
  });

  walker.on('errors', function (root, stats, callback) {
    toolbelt.error('Error walking %s', root, {
      errors: stats.map(function (e) { return e.error; })
    });

    callback();
  });

  walker.on('end', function () {
    toolbelt.debug('Walk completed');

    if (!atLeastOne) {
      toolbelt.info("No preparable content discovered.");
      toolbelt.info("Please add a _deconst.json file to each root directory where content is located.");

      return callback(null, false);
    }

    if (!allSuccessful) {
      return callback(new Error('At least one preparer run terminated unsuccessfully.'), true);
    }

    callback(null, {
      didSomething: true,
      contentIDMap: contentIDMap
    });
  });
};

exports.preparePullRequest = function (toolbelt, callback) {
  var revisionID = null;
  var transientKey = null;
  var contentIDMap = null;
  var presentedURLMap = null;
  var didSomething = false;

  var stagingPresenter = toolbelt.stagingPresenter;
  var stagingContentService = toolbelt.stagingContentService;
  var github = toolbelt.github;

  var generateRevisionID = function (cb) {
    toolbelt.debug('Generating revision ID from git SHA of [%s].', toolbelt.workspacePath());

    childProcess.execFile('git', ['rev-parse', '--short=10', 'HEAD'], { cwd: toolbelt.workspacePath() }, function (err, stdout, stderr) {
      if (err) {
        toolbelt.error("unable to execute git.");
        toolbelt.error("[stdout]\n" + stdout.toString());
        toolbelt.error("[stderr]\n" + stderr.toString());

        return cb(err);
      }

      revisionID = "build-" + stdout.toString().replace(/\r?\n$/, '');
      toolbelt.debug('Revision ID: [%s]', revisionID);
      cb(null);
    });
  };

  var issueTransientKey = function (cb) {
    toolbelt.debug('Issuing transient staging API key.');

    stagingContentService.issueAPIKey('temporary-' + revisionID, function (err, apiKey) {
      if (err) return cb(err);

      transientKey = apiKey;
      cb(null);
    })
  };

  var invokePreparer = function (cb) {
    toolbelt.debug('Invoking preparer with revision ID [%s].', revisionID);

    var opts = {
      revisionID: revisionID,
      contentServiceURL: toolbelt.config.stagingContentServiceURL,
      contentServiceAPIKey: transientKey
    }

    recursivelyPrepare(toolbelt, opts, function (err, result) {
      if (err) return cb(err);

      didSomething = result.didSomething;
      contentIDMap = result.contentIDMap;
      cb(null);
    });
  };

  var revokeTransientKey = function (cb) {
    toolbelt.debug('Revoking transient staging API key.');
    stagingContentService.revokeAPIKey(transientKey, cb);
  };

  var getPresentedURLMap = function (cb) {
    if (!stagingPresenter) {
      toolbelt.error('Unable to comment on GitHub: the staging URL is not configured.');
      return cb(null);
    }

    presentedURLMap = {};

    async.forEachOf(contentIDMap, function (contentID, contentRoot, cb) {
      stagingPresenter.whereis(contentID, function (err, mappings) {
        if (err) return cb(err);

        var presentedURLs = mappings.map(function (mapping) {
          return urlJoin(toolbelt.config.stagingPresenterURL, mapping.path);
        });

        toolbelt.debug('Content root [%s] is mapped to the URL%s %s.',
          contentRoot, presentedURLs.length === 1 ? 's' : '', presentedURLs);
        presentedURLMap[contentRoot] = presentedURLs;

        cb(null);
      });
    }, cb);
  };

  var commentOnGitHub = function (cb) {
    if (!presentedURLMap) return cb(null);

    if (!github) {
      toolbelt.error('Unable to comment on GitHub: no GitHub account available.');

      var contentRoots = Object.keys(presentedURLMap);
      if (contentRoots.length === 1) {
        toolbelt.info('Your preview is available at %s.', presentedURLMap[contentRoots[0]]);
      } else {
        toolbelt.info('Your previews are available at:')
        contentRoots.forEach(function (contentRoot) {
          toolbelt.info('* %s: %s', contentRoot, presentedURLMap[contentRoot]);
        });
      }

      return cb(null);
    }

    var m = /([^/]+\/[^/]+)\/pull\/(\d+)$/.exec(toolbelt.pullRequestURL);

    if (!m) {
      toolbelt.error('Unable to comment on GitHub: the pull request URL looks wrong.');
      toolbelt.error('URL: [%s]', toolbelt.pullRequestURL);

      return cb(null);
    }
    var repoName = m[1];
    var pullRequestNumber = m[2];
    var commentBody = comment.forSuccessfulBuild(presentedURLMap);

    github.postComment(repoName, pullRequestNumber, commentBody, cb);
  };

  async.series([
    generateRevisionID,
    issueTransientKey,
    invokePreparer,
    revokeTransientKey,
    getPresentedURLMap,
    commentOnGitHub
  ], function (err) {
    if (err) return callback(err);

    callback(null, { didSomething: didSomething });
  });
};
