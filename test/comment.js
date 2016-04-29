'use strict'
/* global describe it */

const chai = require('chai')
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const expect = chai.expect

const comment = require('../lib/comment')

describe('forSuccessfulBuild', function () {
  it('shows help when no _deconst.json files were present', function () {
    const output = comment.forSuccessfulBuild({})

    expect(output).to.match(/I didn't find any `deconst\.json` files/)
    expect(output).to.match(/\[[^\]]+\]\(https:\/\/deconst\.horse\/writing-docs\/author\/#adding-a-new-content-repository\)/)
  })

  it('shows help with one unmapped content root', function () {
    const output = comment.forSuccessfulBuild({
      'https://github.com/some/repo': []
    })

    expect(output).to.match(/some of your content is not mapped anywhere/)
    expect(output).to.match(/\[[^\]]+\]\(https:\/\/deconst\.horse\/writing-docs\/coordinator\/mapping\/\)/)
  })
})
