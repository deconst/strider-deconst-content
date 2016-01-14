var fs = require('fs');
var path = require('path');
var stream = require('stream');
var Docker = require('dockerode');
var async = require('async');

var heuristic = require('./heuristic');

var docker;

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

exports.connect = function (opts) {
  opts.whisper("Connecting to Docker", {
    DOCKER_HOST: process.env.DOCKER_HOST,
    DOCKER_TLS_VERIFY: process.env.DOCKER_TLS_VERIFY,
    DOCKER_CERT_PATH: process.env.DOCKER_CERT_PATH
  });

  docker = new Docker();
};

var choosePreparer = function (state) {
  return function (callback) {
    var filename = path.join(state.root, '_deconst.json');

    fs.readFile(filename, { encoding: 'utf-8' }, function (err, contents) {
      var config = {};
      try {
        config = JSON.parse(contents);
      } catch (e) {
        say('Unable to parse _deconst.json file in %s', state.filename);
        return callback(new Error('Unable to parse _deconst.json'));
      }

      if (config.preparer) {
        // Ensure that the preparer is in the whitelist
        if (preparerWhitelist.indexOf(config.preparer) === -1) {
          return callback('Preparer container ' + config.preparer + ' is not on the whitelist');
        }

        state.preparer = config.preparer;
        state.say('Using configured preparer: %s', state.preparer);
        callback(null);
      } else {
        // Infer from directory contents
        heuristic.guessPreparer(state.root, function (err, preparer) {
          if (err) return callback(err);

          state.preparer = preparer;
          state.say('Using inferred preparer: %s', state.preparer);
          callback(null);
        });
      }
    });
  };
};

var pullPreparerContainer = function (state) {
  return function (callback) {
    state.whisper("Pulling latest preparer container image.");

    docker.pull(state.preparer, function (err, stream) {
      if (err) return callback(err);

      var onProgress = function (e) {
        // This is noisy, so do nothing.
      };

      var onFinished = function (err, output) {
        if (err) return callback(err);

        state.whisper("Preparer container image pulled.");
        callback(null);
      };

      docker.modem.followProgress(stream, onFinished, onProgress);
    });
  };
};

var createPreparerContainer = function (state) {
  return function (callback) {
    var volumeRoot = path.resolve(process.cwd(), state.root);
    var containerPath = "/usr/content-repo";

    var bind = volumeRoot + ":" + containerPath;

    var env = [
      "CONTENT_STORE_URL=" + state.contentServiceURL,
      "CONTENT_STORE_APIKEY=" + state.contentServiceAPIKey,
      "TRAVIS_PULL_REQUEST=false"
    ];

    if (state.contentServiceTLSVerify === false) {
      env.push("CONTENT_STORE_TLS_VERIFY=false");
    }

    var params = {
      Image: state.preparer,
      Env: env,
      Mounts: [
        {
          Source: volumeRoot,
          Destination: containerPath,
          Mode: "rw",
          RW: true
        }
      ],
      HostConfig: {
        Binds: [bind]
      }
    };

    state.whisper("Creating preparer container.", params);

    docker.createContainer(params, function (err, container) {
      if (err) return callback(err);

      state.container = container;
      callback(null);
    });
  };
};

var preparerContainerLogs = function (state) {
  return function (callback) {
    state.whisper("Reporting logs from preparer container.", {
      containerId: state.container.id
    });

    var logStream = new stream.PassThrough();

    logStream.on('data', function (chunk) {
      state.say(chunk.toString('utf-8'));
    });

    state.container.logs({
      follow: true,
      stdout: true,
      stderr: true
    }, function (err, stream) {
      if (err) return callback(err);

      state.container.modem.demuxStream(stream, logStream, logStream);

      callback(null);
    });
  };
};

var startPreparerContainer = function (state) {
  return function (callback) {
    state.whisper("Starting preparer container.", {
      containerId: state.container.id
    });

    state.container.start(callback);
  };
};

var waitForCompletion = function (state) {
  return function (callback) {
    state.whisper("Waiting for preparer container completion.", {
      containerId: state.container.id
    });

    state.container.wait(function (err, result) {
      state.status = result.StatusCode;
      callback(null);
    });
  };
};

exports.prepare = function (opts, callback) {
  var state = {
    root: opts.root,
    contentServiceURL: opts.contentServiceURL,
    contentServiceAPIKey: opts.contentServiceAPIKey,
    contentServiceTLSVerify: opts.contentServiceTLSVerify,
    container: null,
    status: null,
    say: opts.say,
    whisper: opts.whisper
  };

  async.series([
    choosePreparer(state),
    pullPreparerContainer(state),
    createPreparerContainer(state),
    startPreparerContainer(state),
    preparerContainerLogs(state),
    waitForCompletion(state)
  ], function (err) {
    if (err) {
      state.say("Preparer completed with an error.", err);
      return callback(err, false);
    }

    state.say("Preparer completed.", {
      status: state.status
    });

    callback(null, state.status === 0);
  });
};
