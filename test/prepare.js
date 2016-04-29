'use strict'
/* global describe it */

const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const expect = chai.expect

const path = require('path')
const MockToolbelt = require('./mocks/toolbelt')
const prepare = require('../lib/prepare')

const jekyllishRoot = path.join(__dirname, 'fixtures', 'jekyllish')

describe('prepare', function () {
  const prepareOpts = {
    contentRoot: jekyllishRoot,
    contentServiceURL: 'https://localhost:9000/',
    contentServiceAPIKey: '12341234'
  }

  const expectedPreparerOpts = {
    Image: 'quay.io/deconst/preparer-jekyll',
    Env: [
      'ENVELOPE_DIR=/usr/content-repo/_deconst/envelopes',
      'ASSET_DIR=/usr/content-repo/_deconst/assets',
      'CONTENT_ID_BASE=https://github.com/some/repo/',
      'VERBOSE='
    ],
    workspace: {
      root: jekyllishRoot,
      rootEnvVar: 'CONTENT_ROOT',
      containerRoot: '/usr/content-repo'
    }
  }

  const expectedSubmitterOpts = {
    Image: 'quay.io/deconst/submitter',
    Env: [
      'CONTENT_SERVICE_URL=https://localhost:9000/',
      'CONTENT_SERVICE_APIKEY=12341234',
      'ENVELOPE_DIR=/usr/content-repo/_deconst/envelopes',
      'ASSET_DIR=/usr/content-repo/_deconst/assets',
      'CONTENT_ID_BASE=https://github.com/some/repo/',
      'VERBOSE='
    ],
    workspace: {
      root: jekyllishRoot,
      rootEnvVar: 'CONTENT_ROOT',
      containerRoot: '/usr/content-repo'
    }
  }

  const runPrepare = (toolbelt, preparerExitStatus, submitterExitStatus, callback) => {
    toolbelt.docker.expectRunContainer(expectedPreparerOpts, preparerExitStatus)
    toolbelt.docker.expectRunContainer(expectedSubmitterOpts, submitterExitStatus)

    prepare.prepare(toolbelt, prepareOpts, callback)
  }

  it('invokes the inferred preparer and submitter on the content root', function (done) {
    const toolbelt = new MockToolbelt({ config: { verbose: false } })

    runPrepare(toolbelt, 0, 0, (err, result) => {
      expect(err).to.be.null()
      expect(result).to.deep.equal({
        contentIDBase: 'https://github.com/some/repo/',
        success: true,
        didSomething: true
      })

      done()
    })
  })

  it('returns didSomething false when nothing was submitted', function (done) {
    const toolbelt = new MockToolbelt({ config: { verbose: false } })

    runPrepare(toolbelt, 0, 2, (err, result) => {
      expect(err).to.be.null()
      expect(result).to.deep.equal({
        contentIDBase: 'https://github.com/some/repo/',
        success: true,
        didSomething: false
      })

      done()
    })
  })

  it('yields an error when the submitter fails', function (done) {
    const toolbelt = new MockToolbelt({
      config: { verbose: false },
      shouldError: true
    })

    runPrepare(toolbelt, 0, 1, (err, result) => {
      expect(err.message).to.equal('Submitter exited with an error status 1')
      done()
    })
  })
})
