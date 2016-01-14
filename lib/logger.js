var winston = require('winston');

var transports = [
  new (winston.transports.Console)({
    level: process.env.DECONST_BUILD_LOG_LEVEL || 'info',
    colorize: true,
    timestamp: true
  })
];

var logger = new (winston.Logger)({ transports: transports });

exports.logger = logger;

exports.say = function () {
  logger.info.apply(logger, arguments);
};

exports.whisper = function () {
  logger.debug.apply(logger, arguments);
};
