'use strict'
/* global describe it */

const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const expect = chai.expect

const path = require('path')

const heuristic = require('../lib/heuristic')

describe('guessPreparer', function () {
  it('detects a Sphinx repository', function (done) {
    heuristic.guessPreparer(path.join(__dirname, 'fixtures', 'sphinxish'), (err, preparer) => {
      expect(err).to.be.null()
      expect(preparer).to.equal('quay.io/deconst/preparer-sphinx')

      done()
    })
  })

  it('detects a Jekyll repository', function (done) {
    heuristic.guessPreparer(path.join(__dirname, 'fixtures', 'jekyllish'), (err, preparer) => {
      expect(err).to.be.null()
      expect(preparer).to.equal('quay.io/deconst/preparer-jekyll')

      done()
    })
  })

  it('detects an unknown repository', function (done) {
    heuristic.guessPreparer(path.join(__dirname, 'fixtures', 'unknown'), (err, preparer) => {
      expect(err.message).to.equal('Unable to infer preparer')
      done()
    })
  })
})
