// Use a variety of templates for the pull request comment to mix it up a bit.

var util = require('util');

var singleMessageTemplates = [
  ':mag_right: [Preview](%s)',
  'Your content preview [is now ready](%s). :bow:',
  ':eyes: [Preview](%s)',
  'If you want to double-check your formatting, check [the preview](%s).'
];

var multiMessageHeaders = [
  'Your content preview is now ready:'
];

exports.forSuccessfulBuild = function (urlMap) {
  var basePaths = Object.keys(urlMap);

  if (basePaths.length === 0) {
    return 'Your build succeeded, but your content is not mapped anywhere ' +
      'in the control repository yet! See the ' +
      '[Deconst documentation](https://deconst.horse/writing-docs/coordinator/mapping/) ' +
      'for information about content mapping.';
  }

  if (basePaths.length === 1) {
    return util.format(randomlyFrom(singleMessageTemplates), urlMap[basePaths[0]]);
  }

  var message = randomlyFrom(multiMessageHeaders);

  message += '\n\n';
  for (var repoPath in urlMap) {
    var stagedURL = urlMap[repoPath];
    var line = util.format('* [`%s`](%s)\n', repoPath, stagedURL);
    message += line;
  }

  return message;
};

var randomlyFrom = function (items) {
  return items[Math.floor(Math.random() * items.length)];
};
