'use strict'
/* global describe it */

const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const expect = chai.expect
const path = require('path')

const MockToolbelt = require('./mocks/toolbelt')
const entry = require('../lib/entry')

describe('recursivelyPrepare', function () {
  const opts = {
    contentServiceURL: 'http://content:9000',
    contentServiceAPIKey: 'swordfish'
  }

  const expectedPreparerOpts = (root, preparer, contentID) => {
    return {
      Image: `quay.io/deconst/preparer-${preparer}`,
      Env: [
        'ENVELOPE_DIR=/usr/content-repo/_deconst/envelopes',
        'ASSET_DIR=/usr/content-repo/_deconst/assets',
        `CONTENT_ID_BASE=${contentID}`,
        'VERBOSE='
      ],
      workspace: {
        root,
        rootEnvVar: 'CONTENT_ROOT',
        containerRoot: '/usr/content-repo'
      }
    }
  }

  const expectedSubmitterOpts = (root, contentID) => {
    return {
      Image: 'quay.io/deconst/submitter',
      Env: [
        'CONTENT_SERVICE_URL=http://content:9000',
        'CONTENT_SERVICE_APIKEY=swordfish',
        'ENVELOPE_DIR=/usr/content-repo/_deconst/envelopes',
        'ASSET_DIR=/usr/content-repo/_deconst/assets',
        `CONTENT_ID_BASE=${contentID}`,
        'VERBOSE='
      ],
      workspace: {
        root,
        rootEnvVar: 'CONTENT_ROOT',
        containerRoot: '/usr/content-repo'
      }
    }
  }

  it('discovers and prepares each content root', function (done) {
    const toolbelt = new MockToolbelt({
      config: { verbose: false },
      contentRoot: path.join(__dirname, 'fixtures')
    })

    const sphinxish = path.join(__dirname, 'fixtures', 'sphinxish')
    toolbelt.docker.expectRunContainer(expectedPreparerOpts(sphinxish, 'sphinx', 'https://github.com/other/repo/'), 0)
    toolbelt.docker.expectRunContainer(expectedSubmitterOpts(sphinxish, 'https://github.com/other/repo/'), 0)

    const jekyllish = path.join(__dirname, 'fixtures', 'jekyllish')
    toolbelt.docker.expectRunContainer(expectedPreparerOpts(jekyllish, 'jekyll', 'https://github.com/some/repo/'), 0)
    toolbelt.docker.expectRunContainer(expectedSubmitterOpts(jekyllish, 'https://github.com/some/repo/'), 0)

    entry.recursivelyPrepare(toolbelt, opts, (err, result) => {
      expect(err).to.be.null()

      expect(result).to.deep.equal({
        didSomething: true,
        submittedSomething: true,
        contentIDMap: {
          'jekyllish': 'https://github.com/some/repo/',
          'sphinxish': 'https://github.com/other/repo/'
        }
      })

      done()
    })
  })

  it('reports when nothing was submitted', function (done) {
    const toolbelt = new MockToolbelt({
      config: { verbose: false },
      contentRoot: path.join(__dirname, 'fixtures', 'jekyllish')
    })

    const jekyllish = path.join(__dirname, 'fixtures', 'jekyllish')
    toolbelt.docker.expectRunContainer(expectedPreparerOpts(jekyllish, 'jekyll', 'https://github.com/some/repo/'), 0)
    toolbelt.docker.expectRunContainer(expectedSubmitterOpts(jekyllish, 'https://github.com/some/repo/'), 2)

    entry.recursivelyPrepare(toolbelt, opts, (err, result) => {
      expect(err).to.be.null()

      expect(result).to.deep.equal({
        didSomething: true,
        submittedSomething: false,
        contentIDMap: {}
      })

      done()
    })
  })

  it('reports when no content is found', function (done) {
    const toolbelt = new MockToolbelt({
      config: { verbose: false },
      contentRoot: path.join(__dirname, 'fixtures', 'unknown')
    })

    entry.recursivelyPrepare(toolbelt, opts, (err, result) => {
      expect(err).to.be.null()

      expect(result).to.deep.equal({
        didSomething: false,
        submittedSomething: false,
        contentIDMap: {}
      })

      done()
    })
  })
})
