var async = require('async');
var util = require('util');
var path = require('path');
var walk = require('walk');
var request = require('request');
var childProcess = require('child_process');
var urlJoin = require('url-join');

var prepare = require('./prepare');
var comment = require('./comment');

var recursivelyPrepare = exports.recursivelyPrepare = function (toolbelt, revisionID, callback) {
  // walk the filesystem from . to find directories that contain a _deconst.json file.
  var options = { followLinks: false };

  var atLeastOne = false;
  var allSuccessful = true;
  var contentIDMap = {};

  walker = walk.walk(workspaceRoot, options);

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

      prepare.prepare(toolbelt, root, revisionID, function (err, results) {
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

  var stagingAPI = null;
  if (toolbelt.config.stagingContentServiceURL) {
    toolbelt.debug('Staging content to content service URL: [%s]', toolbelt.config.stagingContentServiceURL);
    stagingAPI = request.defaults({
      baseUrl: toolbelt.config.stagingContentServiceURL,
      json: true,
      headers: {
        Authorization: util.format('deconst %s', toolbelt.config.stagingContentServiceAdminAPIKey),
        'User-Agent': 'request strider-deconst-control'
      },
      agentOptions: {
        rejectUnauthorized: toolbelt.config.contentServiceTLSVerify
      }
    });
  } else {
    toolbelt.error('Staging content service URL is not specified.');
    return callback(new Error('Missing required configuration'));
  }

  var presenterAPI = null;
  if (toolbelt.config.stagingPresenterURL) {
    toolbelt.debug('Staging content to presenter at URL: [%s]', toolbelt.config.stagingPresenterURL);
    presenterAPI = request.defaults({
      baseUrl: toolbelt.config.stagingPresenterURL,
      json: true,
      headers: {
        'User-Agent': 'request strider-deconst-control'
      }
    });
  }

  var githubAccount = null;
  var githubAPI = null;
  for (var i = 0; i < toolbelt.user.accounts.length; i++) {
    var account = toolbelt.user.accounts[i];
    if (account.provider === 'github') {
      githubAccount = account;
    }
  }
  if (githubAccount) {
    githubAPI = request.defaults({
      baseUrl: 'https://api.github.com',
      json: true,
      headers: {
        Authorization: 'token ' + githubAccount.config.accessToken,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'request strider-deconst-control'
      }
    });
  } else {
    toolbelt.error('User account [%s] has no GitHub account.', toolbelt.user.name);
  }

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

    stagingAPI.post({
      url: '/keys',
      qs: { named: 'temporary' }
    }, function (err, resp, body) {
      if (err) return cb(err);

      if (resp.statusCode !== 200) {
        toolbelt.info('Unable to issue a new API key for the staging content service.');
        toolbelt.info('Status: ', resp.statusCode);
        toolbelt.info('Does the staging API key have admin rights?');

        return cb(new Error('Unable to issue API key'));
      }

      transientKey = body.apikey;
      cb(null);
    });
  };

  var invokePreparer = function (cb) {
    toolbelt.debug('Invoking preparer with revision ID [%s].', revisionID);

    recursivelyPrepare(toolbelt, revisionID, function (err, result) {
      if (err) return cb(err);

      didSomething = result.didSomething;
      contentIDMap = result.contentIDMap;
      cb(null);
    });
  };

  var revokeTransientKey = function (cb) {
    toolbelt.debug('Revoking transient staging API key.');

    stagingAPI.del({
      url: '/keys/' + encodeURIComponent(transientKey)
    }, function (err, resp, body) {
      if (err) return cb(err);

      if (resp.statusCode !== 204) {
        toolbelt.error('Unable to revoke the transient API key from the staging content service.');
        toolbelt.error('Status: %s', resp.statusCode);

        return cb(new Error('Unable to revoke API key'));
      }

      cb(null);
    });
  };

  var getPresentedURLMap = function (cb) {
    if (!toolbelt.config.stagingPresenterURL || !presenterAPI) {
      toolbelt.error('Unable to comment on GitHub: the staging URL is not configured.');
      return cb(null);
    }

    presentedURLMap = {};

    async.forEachOf(contentIDMap, function (contentID, contentRoot, cb) {
      var whereis = '/_api/whereis/' + encodeURIComponent(contentID);
      presenterAPI.get(whereis, function (err, resp, body) {
        if (err) return cb(err);

        if (resp.statusCode !== 200) {
          toolbelt.error('Unsuccessful %s response returned from staging presenter API.', resp.statusCode);
          toolbelt.error(' Content root: [%s]', contentRoot);
          toolbelt.error(' Staging presenter: [%s]', toolbelt.config.stagingPresenterURL);
          toolbelt.error(' Query: [%s]', whereis);
          toolbelt.error(' Content ID: [%s]', contentID);

          return cb(new Error('Unable to map content IDs'));
        }

        var presentedURLs = body.mappings.map(function (mapping) {
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

    if (!githubAPI) {
      toolbelt.debug('Unable to comment on GitHub: no GitHub account available.');

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

    var u = util.format('/repos/%s/issues/%s/comments', repoName, pullRequestNumber);
    githubAPI.post({
      url: u,
      body: { body: comment.forSuccessfulBuild(presentedURLMap) }
    }, function (err, resp) {
      if (err) return cb(err);

      if (resp.statusCode !== 201) {
        toolbelt.error("I couldn't post the comment to GitHub!");
        toolbelt.error("The GitHub API responded with status [%s].", resp.statusCode);
        return cb(new Error('Unable to post the build comment'));
      }

      cb(null);
    });
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

    callback(null, didSomething);
  });
};
