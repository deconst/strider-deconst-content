'use strict'

const chai = require('chai')
const expect = chai.expect
const _ = require('lodash')

function MockDocker () {
  this.expected = []
}

module.exports = MockDocker

MockDocker.prototype.runContainer = function (options, callback) {
  const current = this.expected.find((each) => _.isEqual(each.options, options))
  expect(current).not.to.be.undefined()

  process.nextTick(() => callback(null, { status: current.statusCode }))
}

MockDocker.prototype.expectRunContainer = function (options, statusCode) {
  this.expected.push({ options, statusCode })
}
