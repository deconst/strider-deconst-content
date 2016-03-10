var async = require('async');
var util = require('util');
var walk = require('walk');
var request = require('request');
var childProcess = require('child_process');

var prepare = require('./prepare');

exports.recursivelyPrepare = function (opts, callback) {
  var root = opts.root;
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

  walker = walk.walk(root, options);

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

      prepare.prepare(opts, function (err, success) {
        atLeastOne = true;

        if (err) {
          allSuccessful = false;
          return callback(err);
        }

        allSuccessful = allSuccessful && success;
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

    callback(null, true);
  });
};

exports.preparePullRequest = function (opts, callback) {
  var revisionID = null;
  var transientKey = null;
  var didSomething = false;

  var stagingAPI = request.defaults({
    baseURL: opts.stagingContentServiceURL,
    json: true,
    headers: {
      Authorization: util.format('deconst apikey="%s"', opts.stagingContentServiceAdminAPIKey),
      'User-Agent': 'request strider-deconst-control'
    },
    agentOptions: {
      rejectUnauthorized: opts.contentServiceTLSVerify
    }
  });

  var generateRevisionID = function (cb) {
    opts.whisper('Generating revision ID from git SHA of [%s].', opts.root);

    childProcess.execFile('git', ['rev-parse', '--short=10', 'HEAD'], {
      cwd: opts.root,
      callback: function (err, stdout, stderr) {
        if (err) {
          opts.write("unable to execute git.");
          opts.write("[stdout]\n" + stdout.toString());
          opts.write("[stderr]\n" + stderr.toString());

          return cb(err);
        }

        revisionID = "build-" + stdout.toString().replace(/\r?\n$/);
        opts.whisper('Revision ID: [%s]', revisionID);
        cb(null);
      }
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

        return callback(new Error('Unable to issue API key'));
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

    exports.recursivelyPrepare(preparerOpts, function (err, progress) {
      if (err) return cb(err);

      didSomething = progress;
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

        return callback(new Error('Unable to revoke API key'));
      }

      cb(null);
    });
  };

  var commentOnGitHub = function (cb) {
    opts.say('This is where I\'d comment on GitHub.');

    cb(null);
  };

  async.series([
    generateRevisionID,
    issueTransientKey,
    invokePreparer,
    revokeTransientKey,
    commentOnGitHub
  ], function (err) {
    if (err) return callback(err);

    callback(null, didSomething);
  });
};
