const test = require('node:test')
const assert = require('node:assert/strict')
const { span, tokens, money, percent, plural } = require('../extension/format')

test('span formats minutes, hours and days', () => {
  assert.equal(span(0), '0m')
  assert.equal(span(-5000), '0m')
  assert.equal(span(5 * 60000), '5m')
  assert.equal(span(65 * 60000), '1h 05m')
  assert.equal(span(49 * 3600000), '2d 1h')
})

test('tokens abbreviates thousands and millions', () => {
  assert.equal(tokens(999), '999')
  assert.equal(tokens(1500), '2k')
  assert.equal(tokens(2_340_000), '2.3M')
})

test('money, percent and plural helpers', () => {
  assert.equal(money(2.375), '$2.38')
  assert.equal(percent(67.6), '68%')
  assert.equal(plural(1, 'table'), '1 table')
  assert.equal(plural(3, 'table'), '3 tables')
})
