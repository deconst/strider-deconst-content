'use strict'

function MockContentService () {
  this.keyToIssue = null
  this.keyToRevoke = null
}

module.exports = MockContentService

MockContentService.prototype.issueAPIKey = function (keyName, callback) {
  if (this.keyToIssue && this.keyToIssue.keyName === keyName) {
    process.nextTick(() => callback(null, this.keyToIssue.apiKey))
    return
  }

  process.nextTick(() => callback(new Error(`Unexpected issueAPIKey call: ${keyName}`)))
}

MockContentService.prototype.revokeAPIKey = function (apikey, callback) {
  if (this.keyToRevoke && this.keyToRevoke === apikey) {
    process.nextTick(() => callback(null))
    return
  }

  process.nextTick(() => callback(new Error(`Unexpected revokeAPIKey call: ${apikey}`)))
}

MockContentService.prototype.expectKeyIssuance = function (keyName, apiKey) {
  this.keyToIssue = { keyName, apiKey, revoked: false }
}

MockContentService.prototype.expectKeyRevocation = function (apiKey) {
  this.keyToRevoke = apiKey
}
