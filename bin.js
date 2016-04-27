#!/usr/bin/env node
'use strict'

var entry = require('./lib/entry')

var toolbelt = {
  workspacePath: function () { return '.' },

  info: console.log,
  debug: console.log,
  error: console.error
}

entry.recursivelyPrepare(toolbelt, null, function (err) {
  if (err) {
    toolbelt.error('Preparation unsuccessful.', err)

    process.exit(1)
  }
})
