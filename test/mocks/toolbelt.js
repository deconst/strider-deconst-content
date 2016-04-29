'use strict'

const util = require('util')
const chai = require('chai')
const fail = chai.assert.fail

const MockDocker = require('./docker')

function MockToolbelt (options) {
  this.docker = new MockDocker()

  this.workspaceContainerName = options.workspaceContainerName
  this.config = options.config || {}

  this.shouldOutput = (process.env.VERBOSE || '') !== ''
  this.shouldError = options.shouldError
}

module.exports = MockToolbelt

MockToolbelt.prototype.workspaceContainer = function () {
  return this.workspaceContainerName
}

MockToolbelt.prototype.info = function () {
  if (this.shouldOutput) {
    console.log(util.format(arguments))
  }
}

MockToolbelt.prototype.error = function () {
  if (!this.shouldError) {
    fail('', '', util.format.apply(null, arguments))
  }
}
