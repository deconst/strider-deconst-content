'use strict'

// Use a variety of templates for the pull request comment to mix it up a bit.

var util = require('util')

var singleMessageTemplates = [
  ':mag_right: [Preview](%s)',
  'Your content preview [is now ready](%s). :bow:',
  ':eyes: [Preview](%s)',
  'If you want to double-check your formatting, check [the preview](%s).',
  'HULK [PREVIEW](%s)'
]

var multiMessageHeaders = [
  'Your content preview is now ready:',
  'HULK PREVIEW'
]

var deconstJSONHelp = "I didn't find any `deconst.json` files in your content repository! See " +
  '[Deconst documentation](https://deconst.horse/writing-docs/author/#adding-a-new-content-repository) ' +
  'for information about configuring your repository to build Deconst content.'

var mappingHelp = 'Your build succeeded, but some of your content is not mapped anywhere ' +
  'in the control repository yet! See the ' +
  '[Deconst documentation](https://deconst.horse/writing-docs/coordinator/mapping/) ' +
  'for information about content mapping.'

exports.forSuccessfulBuild = function (urlMap) {
  var contentRoots = Object.keys(urlMap)
  var message = ''

  // No content discovered. This means that you're missing a _deconst.json file.
  // (If the preparer failed, prepareRecursively retuns an error instead.)
  if (contentRoots.length === 0) {
    return deconstJSONHelp
  }

  // The common case: a single content repository
  if (contentRoots.length === 1) {
    var urls = urlMap[contentRoots[0]]
    if (urls.length === 0) {
      // The only content root was not mapped.
      return mappingHelp
    } else if (urls.length === 1) {
      // The common case: mapped to a single place.
      return util.format(randomlyFrom(singleMessageTemplates), urlMap[contentRoots[0]])
    } else {
      // This content was mapped to multiple places.
      message = randomlyFrom(multiMessageHeaders)
      message += '\n\n'

      for (var i = 0; i < urls.length; i++) {
        message += util.format('* [%s](%s)\n', urls[i], urls[i])
      }

      return message
    }
  }

  message = randomlyFrom(multiMessageHeaders)
  var hasUnmapped = false

  message += '\n\n'
  for (var contentRoot in urlMap) {
    var stagedURLs = urlMap[contentRoot]
    if (stagedURLs.length === 0) {
      hasUnmapped = true
      message += util.format('* The content at `%s` is not mapped anywhere!\n', contentRoot)
    } else if (stagedURLs.length === 1) {
      message += util.format('* [`%s`](%s)\n', contentRoot, stagedURLs[0])
    } else {
      message += util.format('* `%s` is available: ', contentRoot)
      for (var j = 0; j < stagedURLs.length; j++) {
        if (j !== 0) {
          message += ', '
        }
        message += util.format('[%s](%s)', stagedURLs[j], stagedURLs[j])
      }
      message += '\n'
    }
  }

  if (hasUnmapped) {
    message += '\n\n' + mappingHelp
  }

  return message
}

var randomlyFrom = function (items) {
  return items[Math.floor(Math.random() * items.length)]
}
