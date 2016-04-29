'use strict'

const chai = require('chai')
const expect = chai.expect

function MockDocker () {
  this.expected = []
}

module.exports = MockDocker

MockDocker.prototype.runContainer = function (options, callback) {
  const current = this.expected.shift()
  expect(options).to.deep.equal(current.options)

  process.nextTick(() => callback(null, { status: current.statusCode }))
}

MockDocker.prototype.expectRunContainer = function (options, statusCode) {
  this.expected.push({ options, statusCode })
}
