'use strict'
/* global describe it */

const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const expect = chai.expect
const fail = chai.assert.fail

const util = require('util')
const path = require('path')
const MockDocker = require('./mocks/docker')
const prepare = require('../lib/prepare')

const jekyllishRoot = path.join(__dirname, 'fixtures', 'jekyllish')

describe('prepare', function () {
  it('Invokes the inferred preparer and submitter on the content root', function (done) {
    const toolbelt = {
      workspaceContainer: () => null,
      docker: new MockDocker(),
      config: { verbose: false },
      info: () => null,
      error: function () { fail('', '', util.format.apply(null, arguments)) }
    }

    const opts = {
      contentRoot: jekyllishRoot,
      contentServiceURL: 'https://localhost:9000/',
      contentServiceAPIKey: '12341234'
    }

    toolbelt.docker.expectRunContainer({
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
    }, 0)

    toolbelt.docker.expectRunContainer({
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
    }, 0)

    prepare.prepare(toolbelt, opts, (err, result) => {
      expect(err).to.be.null()
      expect(result).to.deep.equal({
        contentIDBase: 'https://github.com/some/repo/',
        success: true,
        didSomething: true
      })

      done()
    })
  })
})
