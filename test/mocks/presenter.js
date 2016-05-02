'use strict'

function MockPresenter () {
  this.contentIDMap = {}
}

module.exports = MockPresenter

MockPresenter.prototype.whereis = function (contentID, callback) {
  const mappedPath = this.contentIDMap[contentID]
  if (mappedPath !== undefined) {
    process.nextTick(() => callback(null, [{ path: mappedPath }]))
    return
  }

  process.nextTick(() => callback(new Error(`Request for unexpected contentID: ${contentID}`)))
}

MockPresenter.prototype.expectWhereis = function (contentID, mappedPath) {
  this.contentIDMap[contentID] = mappedPath
}
