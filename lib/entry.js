var walk = require('walk');
var request = require('request');

var prepare = require('./prepare');

exports.recursivelyPrepare = function (opts, callback) {
  var root = opts.root;
  var say = opts.say;
  var whisper = opts.whisper;
  var contentServiceURL = opts.contentServiceURL || '';
  var contentServiceAPIKey = opts.contentServiceAPIKey || '';

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
        contentServiceURL: contentServiceURL,
        contentServiceAPIKey: contentServiceAPIKey,
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
