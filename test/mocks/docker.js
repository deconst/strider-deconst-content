'use strict'

const chai = require('chai')
const fail = chai.assert.fail
const util = require('util')
const _ = require('lodash')

function MockDocker () {
  this.expected = []
}

module.exports = MockDocker

MockDocker.prototype.runContainer = function (options, callback) {
  const current = this.expected.find((each) => _.isEqual(each.options, options))
  if (current === undefined) {
    fail('', '', `Unexpected container options: ${util.inspect(options)}`)
  }

  process.nextTick(() => callback(null, { status: current.statusCode }))
}

MockDocker.prototype.expectRunContainer = function (options, statusCode) {
  this.expected.push({ options, statusCode })
}
