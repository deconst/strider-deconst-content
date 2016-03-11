var async = require('async');
var util = require('util');
var path = require('path');
var walk = require('walk');
var request = require('request');
var childProcess = require('child_process');
var urlJoin = require('url-join');

var prepare = require('./prepare');
var comment = require('./comment');

exports.recursivelyPrepare = function (opts, callback) {
  var workspaceRoot = opts.root;
  var dataContainer = opts.dataContainer;
  var say = opts.say;
  var whisper = opts.whisper;
  var contentServiceURL = opts.contentServiceURL || '';
  var contentServiceAPIKey = opts.contentServiceAPIKey || '';
  var contentServiceTLSVerify = opts.contentServiceTLSVerify;
  var revisionID = opts.revisionID;

  prepare.connect({
    whisper: whisper
  });

  // walk the filesystem from . to find directories that contain a _deconst.json file.
  var options = {
    followLinks: false,
  };

  var atLeastOne = false;
  var allSuccessful = true;
  var contentIDMap = {};

  walker = walk.walk(workspaceRoot, options);

  walker.on('directories', function (root, stats, callback) {
    whisper('Traversing directories: %s', root);

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
      say('Deconst content directory: %s', root);

      var opts = {
        root: root,
        dataContainer: dataContainer,
        contentServiceURL: contentServiceURL,
        contentServiceAPIKey: contentServiceAPIKey,
        contentServiceTLSVerify: contentServiceTLSVerify,
        revisionID: revisionID,
        whisper: whisper,
        say: say
      };

      prepare.prepare(opts, function (err, results) {
        atLeastOne = true;

        if (err) {
          allSuccessful = false;
          return callback(err);
        }

        var relativeRoot = path.relative(workspaceRoot, root);

        allSuccessful = allSuccessful && results.success;
        contentIDMap[relativeRoot] = results.contentIDBase;
        callback(null);
      });
    } else {
      callback(null);
    }
  });

  walker.on('errors', function (root, stats, callback) {
    say('Error walking %s', root, {
      errors: stats.map(function (e) { return e.error; })
    });

    callback();
  });

  walker.on('end', function () {
    whisper('Walk completed');

    if (!atLeastOne) {
      say("No preparable content discovered.");
      say("Please add a _deconst.json file to each root directory where content is located.");

      return callback(null, false);
    }

    if (!allSuccessful) {
      return callback("At least one preparer run terminated unsuccessfully.", true);
    }

    callback(null, {
      didSomething: true,
      contentIDMap: contentIDMap
    });
  });
};

exports.preparePullRequest = function (opts, callback) {
  var revisionID = null;
  var transientKey = null;
  var contentIDMap = null;
  var presentedURLMap = null;
  var didSomething = false;

  var stagingAPI = null;
  if (opts.stagingContentServiceURL) {
    opts.whisper('Staging content to content service URL: [%s]', opts.stagingContentServiceURL);
    stagingAPI = request.defaults({
      baseUrl: opts.stagingContentServiceURL,
      json: true,
      headers: {
        Authorization: util.format('deconst apikey="%s"', opts.stagingContentServiceAdminAPIKey),
        'User-Agent': 'request strider-deconst-control'
      },
      agentOptions: {
        rejectUnauthorized: opts.contentServiceTLSVerify
      }
    });
  } else {
    opts.say('Staging content service URL is not specified.');
    return callback(new Error('Missing required configuration'));
  }

  var presenterAPI = null;
  if (opts.stagingPresenterURL) {
    opts.whisper('Staging content to presenter at URL: [%s]', opts.stagingPresenterURL);
    presenterAPI = request.defaults({
      baseUrl: opts.stagingPresenterURL,
      json: true,
      headers: {
        'User-Agent': 'request strider-deconst-control'
      }
    });
  }

  var githubAccount = null;
  var githubAPI = null;
  for (var i = 0; i < opts.user.accounts.length; i++) {
    var account = opts.user.accounts[i];
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
    opts.say('User account [%s] has no GitHub account.', opts.user.name);
  }

  var generateRevisionID = function (cb) {
    opts.whisper('Generating revision ID from git SHA of [%s].', opts.root);

    childProcess.execFile('git', ['rev-parse', '--short=10', 'HEAD'], { cwd: opts.root }, function (err, stdout, stderr) {
      if (err) {
        opts.write("unable to execute git.");
        opts.write("[stdout]\n" + stdout.toString());
        opts.write("[stderr]\n" + stderr.toString());

        return cb(err);
      }

      revisionID = "build-" + stdout.toString().replace(/\r?\n$/, '');
      opts.whisper('Revision ID: [%s]', revisionID);
      cb(null);
    });
  };

  var issueTransientKey = function (cb) {
    opts.whisper('Issuing transient staging API key.');

    stagingAPI.post({
      url: '/keys',
      qs: { named: 'temporary' }
    }, function (err, resp, body) {
      if (err) return cb(err);

      if (resp.statusCode !== 200) {
        opts.say('Unable to issue a new API key for the staging content service.');
        opts.say('Status: ', resp.statusCode);
        opts.say('Does the staging API key have admin rights?');

        return cb(new Error('Unable to issue API key'));
      }

      transientKey = body.apikey;
      cb(null);
    });
  };

  var invokePreparer = function (cb) {
    opts.whisper('Invoking preparer with revision ID [%s].', revisionID);

    var preparerOpts = {
      root: opts.root,
      dataContainer: opts.dataContainer,
      contentServiceURL: opts.stagingContentServiceURL,
      contentServiceAPIKey: transientKey,
      contentServiceTLSVerify: opts.contentServiceTLSVerify,
      revisionID: revisionID,
      say: opts.say,
      whisper: opts.whisper
    };

    exports.recursivelyPrepare(preparerOpts, function (err, result) {
      if (err) return cb(err);

      didSomething = result.didSomething;
      contentIDMap = result.contentIDMap;
      cb(null);
    });
  };

  var revokeTransientKey = function (cb) {
    opts.whisper('Revoking transient staging API key.');

    stagingAPI.del({
      url: '/keys/' + encodeURIComponent(transientKey)
    }, function (err, resp, body) {
      if (err) return cb(err);

      if (resp.statusCode !== 204) {
        opts.say('Unable to revoke the transient API key from the staging content service.');
        opts.say('Status: %s', resp.statusCode);

        return cb(new Error('Unable to revoke API key'));
      }

      cb(null);
    });
  };

  var getPresentedURLMap = function (cb) {
    if (!opts.stagingPresenterURL || !presenterAPI) {
      opts.say('Unable to comment on GitHub: the staging URL is not configured.');
      return cb(null);
    }

    presentedURLMap = {};

    async.forEachOf(contentIDMap, function (contentID, contentRoot, cb) {
      var whereis = '/_api/whereis/' + encodeURIComponent(contentID);
      presenterAPI.get(whereis, function (err, resp, body) {
        if (err) return cb(err);

        if (resp.statusCode !== 200) {
          opts.say('Unsuccessful %s response returned from staging presenter API.', resp.statusCode);
          opts.say(' Content root: [%s]', contentRoot);
          opts.say(' Staging presenter: [%s]', opts.stagingPresenterURL);
          opts.say(' Query: [%s]', whereis);
          opts.say(' Content ID: [%s]', contentID);

          return cb(new Error('Unable to map content IDs'));
        }

        var presentedURLs = body.mappings.map(function (mapping) {
          return urlJoin(opts.stagingPresenterURL, mapping.path);
        });

        opts.whisper('Content root [%s] is mapped to the URL%s %s.',
          contentRoot, presentedURLs.length === 1 ? 's' : '', presentedURLs);
        presentedURLMap[contentRoot] = presentedURLs;
      });
    }, cb);
  };

  var commentOnGitHub = function (cb) {
    if (!presentedURLMap) return cb(null);

    if (!githubAPI) {
      opts.say('Unable to comment on GitHub: no GitHub account available.');

      var contentRoots = Object.keys(presentedURLMap);
      if (contentRoots.length === 1) {
        opts.say('Your preview is available at %s.', presentedURLMap[contentRoots[0]]);
      } else {
        opts.say('Your previews are available at:')
        contentRoots.forEach(function (contentRoot) {
          opts.say('* %s: %s', contentRoot, presentedURLMap[contentRoot]);
        });
      }

      return cb(null);
    }

    var m = /([^/]+\/[^/]+)\/pull\/(\d+)$/.exec(opts.pullRequestURL);

    if (!m) {
      opts.say('Unable to comment on GitHub: the pull request URL looks wrong.');
      opts.say('URL: [%s]', opts.pullRequestURL);

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
        opts.say("I couldn't post the comment to GitHub!");
        opts.say("The GitHub API responded with status [%s].", resp.statusCode);
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
