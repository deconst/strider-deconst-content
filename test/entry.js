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

describe('preparePullRequest', function () {
  it('invokes the preparer chain with a revision ID and a transient key', function (done) {
    const toolbelt = new MockToolbelt({
      config: {
        verbose: false,
        mockGitSHA: '1111111111',
        stagingContentServiceURL: 'https://content.staging.nope.horse',
        stagingPresenterURL: 'https://staging.nope.horse'
      },
      contentRoot: path.join(__dirname, 'fixtures', 'jekyllish'),
      pullRequestURL: 'https://github.com/some/repo/pull/123'
    })

    toolbelt.stagingContentService.expectKeyIssuance('temporary-build-1111111111', '1234567890')
    toolbelt.stagingContentService.expectKeyRevocation('1234567890')

    const jekyllish = path.join(__dirname, 'fixtures', 'jekyllish')
    toolbelt.docker.expectRunContainer({
      Image: 'quay.io/deconst/preparer-jekyll',
      Env: [
        'ENVELOPE_DIR=/usr/content-repo/_deconst/envelopes',
        'ASSET_DIR=/usr/content-repo/_deconst/assets',
        'CONTENT_ID_BASE=https://github.com/build-1111111111/some/repo/',
        'VERBOSE='
      ],
      workspace: {
        root: jekyllish,
        rootEnvVar: 'CONTENT_ROOT',
        containerRoot: '/usr/content-repo'
      }
    }, 0)
    toolbelt.docker.expectRunContainer({
      Image: 'quay.io/deconst/submitter',
      Env: [
        'CONTENT_SERVICE_URL=https://content.staging.nope.horse',
        'CONTENT_SERVICE_APIKEY=1234567890',
        'ENVELOPE_DIR=/usr/content-repo/_deconst/envelopes',
        'ASSET_DIR=/usr/content-repo/_deconst/assets',
        'CONTENT_ID_BASE=https://github.com/build-1111111111/some/repo/',
        'VERBOSE='
      ],
      workspace: {
        root: jekyllish,
        rootEnvVar: 'CONTENT_ROOT',
        containerRoot: '/usr/content-repo'
      }
    }, 0)

    toolbelt.stagingPresenter.expectWhereis(
      'https://github.com/build-1111111111/some/repo/',
      '/build-1111111111/a/path/')

    // Ensure that the GitHub comment contains a Markdown link to the presented URL:
    // https://staging.nope.horse/build-1111111111/a/path/
    toolbelt.github.expectPostComment('some/repo', '123',
      /\[[^\]]+\]\(https:\/\/staging\.nope\.horse\/build-1111111111\/a\/path\/\)/)

    entry.preparePullRequest(toolbelt, (err, result) => {
      expect(err).to.be.null()
      expect(result.didSomething).to.be.true()

      done()
    })
  })

  it('omits the GitHub preview comment if nothing was prepareed')
})
