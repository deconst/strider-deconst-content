'use strict'

const fs = require('fs')
const path = require('path')
const url = require('url')
const async = require('async')
const rimraf = require('rimraf')

const heuristic = require('./heuristic')

const preparerWhitelist = (function () {
  const whitelist = process.env.DECONST_BUILD_WHITELIST

  if (whitelist) {
    return whitelist.split(/\s*,\s*/)
  } else {
    return [
      'quay.io/deconst/preparer-sphinx',
      'quay.io/deconst/preparer-jekyll'
    ]
  }
})()

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
  let contentIDBase = null
  let preparer = null
  let preparerStatus = null
  let submitterStatus = null

  const docker = toolbelt.docker

  const root = toolbelt.workspaceContainer() ? opts.contentRoot : '/usr/content-repo'
  const envelopeDir = path.join(root, '_deconst/envelopes')
  const assetDir = path.join(root, '_deconst/assets')

  const readConfiguration = (cb) => {
    var filename = path.join(opts.contentRoot, '_deconst.json')

    fs.readFile(filename, { encoding: 'utf-8' }, (err, contents) => {
      if (err) {
        toolbelt.error('Unable to read %s: %s', filename, err.message)
        return cb(new Error('Unable to read _deconst.json'))
      }

      var config = {}
      try {
        config = JSON.parse(contents)
      } catch (e) {
        toolbelt.error('Unable to parse _deconst.json file in %s', filename)
        return cb(new Error('Unable to parse _deconst.json'))
      }

      if (config.contentIDBase) {
        contentIDBase = config.contentIDBase

        if (opts.revisionID) {
          // Prepend the revision ID as the first path segment of the content ID.
          var u = url.parse(contentIDBase)

          var parts = u.pathname.split('/')
          while (parts[0] === '') {
            parts.shift()
          }
          parts.unshift(opts.revisionID)
          u.pathname = '/' + parts.join('/')

          contentIDBase = url.format(u)
          toolbelt.debug('Revised content ID base: [%s]', contentIDBase)
        }
      } else {
        toolbelt.error('No content ID base found in %s', filename)
        return cb(new Error('No content ID base found in _deconst.json'))
      }

      if (config.preparer) {
        // Ensure that the preparer is in the whitelist
        if (preparerWhitelist.indexOf(config.preparer) === -1) {
          return cb(new Error('Preparer container ' + config.preparer + ' is not on the whitelist'))
        }

        preparer = config.preparer
        toolbelt.info('Using configured preparer: %s', preparer)
        cb(null)
      } else {
        // Infer from directory contents
        heuristic.guessPreparer(opts.contentRoot, (err, p) => {
          if (err) return cb(err)

          preparer = p
          toolbelt.info('Using inferred preparer: %s', preparer)
          cb(null)
        })
      }
    })
  }

  const clearOutputDirectories = (cb) => {
    async.each([envelopeDir, assetDir], (dir, cb) => rimraf(dir, cb), cb)
  }

  const runPreparer = (cb) => {
    var params = {
      Image: preparer,
      Env: [
        'ENVELOPE_DIR=' + envelopeDir,
        'ASSET_DIR=' + assetDir,
        'CONTENT_ID_BASE=' + contentIDBase,
        'VERBOSE=' + (toolbelt.config.verbose ? 'true' : '')
      ],
      workspace: {
        root: opts.contentRoot,
        rootEnvVar: 'CONTENT_ROOT',
        containerRoot: '/usr/content-repo'
      }
    }

    docker.runContainer(params, (err, result) => {
      if (err) return cb(err)

      preparerStatus = result.status

      if (preparerStatus !== 0) {
        return cb(new Error('Preparer exited with an error status ' + preparerStatus))
      }
      toolbelt.info('Preparer completed successfull.')
      cb(null)
    })
  }

  const runSubmitter = (cb) => {
    var params = {
      Image: 'quay.io/deconst/submitter',
      Env: [
        'CONTENT_SERVICE_URL=' + opts.contentServiceURL,
        'CONTENT_SERVICE_APIKEY=' + opts.contentServiceAPIKey,
        'ENVELOPE_DIR=' + envelopeDir,
        'ASSET_DIR=' + assetDir,
        'CONTENT_ID_BASE=' + contentIDBase,
        'VERBOSE=' + (toolbelt.config.verbose ? 'true' : '')
      ],
      workspace: {
        root: opts.contentRoot,
        rootEnvVar: 'CONTENT_ROOT',
        containerRoot: '/usr/content-repo'
      }
    }

    docker.runContainer(params, (err, result) => {
      if (err) return cb(err)

      submitterStatus = result.status

      if (submitterStatus !== 0 && submitterStatus !== 2) {
        return cb(new Error('Submitter exited with an error status ' + submitterStatus))
      }
      toolbelt.info('Submitter completed successfully.')
      cb(null)
    })
  }

  async.series([
    readConfiguration,
    clearOutputDirectories,
    runPreparer,
    runSubmitter
  ], function (err) {
    const result = {
      contentIDBase: contentIDBase,
      success: false,
      didSomething: false
    }

    if (err) {
      toolbelt.error('Oh no:', err)
      return callback(err, result)
    }
    result.success = true

    if (submitterStatus === 0) {
      toolbelt.info('All content prepared and submitted successfully.')
      result.didSomething = true
    } else if (submitterStatus === 2) {
      toolbelt.info('Nothing to submit.')
    } else {
      toolbelt.error('Unexpected exit code reported from submitter: ' + submitterStatus)
    }

    callback(null, result)
  })
}
