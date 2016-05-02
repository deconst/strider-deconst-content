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
    const output = comment.forSuccessfulBuild({ '/': [] })

    expect(output).to.match(/some of your content is not mapped anywhere/)
    expect(output).to.match(/\[[^\]]+\]\(https:\/\/deconst\.horse\/writing-docs\/coordinator\/mapping\/\)/)
  })

  it('shows a link for a single content root mapped to a single place', function () {
    const output = comment.forSuccessfulBuild({ '/': [ 'https://deconst.horse/only/' ] })

    expect(output).to.match(/\[[^\]]+\]\(https:\/\/deconst\.horse\/only\/\)/)
  })

  it('shows all links for a content root mapped to multiple places', function () {
    const output = comment.forSuccessfulBuild({
      '/': [ 'https://deconst.horse/one/', 'https://deconst.horse/two/' ]
    })

    const expected = '\n\n* [https://deconst.horse/one/](https://deconst.horse/one/)\n' +
      '* [https://deconst.horse/two/](https://deconst.horse/two/)\n'

    expect(output.endsWith(expected)).to.be.true()
  })

  it('shows links for multiple content roots', function () {
    const output = comment.forSuccessfulBuild({
      '/one': [ 'https://deconst.horse/one/' ],
      '/two': [ 'https://deconst.horse/two-0/', 'https://deconst.horse/two-1' ]
    })

    expect(output).to.include('\n* [`/one`](https://deconst.horse/one/)\n')
    expect(output).to.include('\n* `/two` is available: ' +
      '[https://deconst.horse/two-0/](https://deconst.horse/two-0/), ' +
      '[https://deconst.horse/two-1](https://deconst.horse/two-1)\n')
  })

  it('shows help for unmapped content with multiple content roots', function () {
    const output = comment.forSuccessfulBuild({
      '/zero': [],
      '/one': [ 'https://deconst.horse/one/' ]
    })

    expect(output).to.include('\n* The content at `/zero` is not mapped anywhere!\n')
    expect(output).to.include('Your build succeeded, but some of your content is not mapped anywhere')
    expect(output).to.include('\n* [`/one`](https://deconst.horse/one/)\n')
  })
})
