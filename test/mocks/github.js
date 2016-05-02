'use strict'

function MockGitHub () {
  this.expectedComment = null
}

module.exports = MockGitHub

MockGitHub.prototype.postComment = function (repoName, pullRequestNumber, commentBody, callback) {
  if (this.expectedComment &&
    this.expectedComment.repoName === repoName &&
    this.expectedComment.pullRequestNumber === pullRequestNumber &&
    this.expectedComment.commentPattern.test(commentBody)
  ) {
    process.nextTick(() => callback(null))
    return
  }

  process.nextTick(() => callback(new Error(`Unexpected GitHub comment: ${repoName}#${pullRequestNumber}\n${commentBody}`)))
}

MockGitHub.prototype.expectPostComment = function (repoName, pullRequestNumber, commentPattern) {
  this.expectedComment = { repoName, pullRequestNumber, commentPattern }
}
