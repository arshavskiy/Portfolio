import test from 'node:test'
import assert from 'node:assert/strict'
import {groupItems} from './useGrouping.js'

const items = [
  {
    ticker: 'API-WINNER',
    changePercent: 8,
    history: [{close: 100}, {close: 90}],
    preMarketChangePercent: 3,
    postMarketChangePercent: -1,
  },
  {
    ticker: 'RANGE-WINNER',
    changePercent: -5,
    history: [{close: 100}, {close: 115}],
    preMarketChangePercent: -4,
    postMarketChangePercent: 6,
  },
  {
    ticker: 'NO-HISTORY',
    changePercent: 2,
  },
]

test('change grouping sorts by range history percent when history is present', () => {
  const [section] = groupItems(items, 'change', new Date('2026-06-17T12:00:00Z'), 'down')

  assert.deepEqual(section.items.map((item) => item.ticker), [
    'RANGE-WINNER',
    'NO-HISTORY',
    'API-WINNER',
  ])
})

test('change grouping can flip to losers first using the same range percent', () => {
  const [section] = groupItems(items, 'change', new Date('2026-06-17T12:00:00Z'), 'up')

  assert.deepEqual(section.items.map((item) => item.ticker), [
    'API-WINNER',
    'NO-HISTORY',
    'RANGE-WINNER',
  ])
})

test('pre and post grouping sort by their own extended-hours values', () => {
  const [preSection] = groupItems(items, 'pre', new Date('2026-06-17T12:00:00Z'), 'down')
  const [postSection] = groupItems(items, 'post', new Date('2026-06-17T12:00:00Z'), 'down')

  assert.deepEqual(preSection.items.map((item) => item.ticker), [
    'API-WINNER',
    'RANGE-WINNER',
    'NO-HISTORY',
  ])

  assert.deepEqual(postSection.items.map((item) => item.ticker), [
    'RANGE-WINNER',
    'API-WINNER',
    'NO-HISTORY',
  ])
})

test('group mode sorts items within each group ascending by ticker', () => {
  const groupedItems = [
    {ticker: 'ZETA', groups: ['Alpha']},
    {ticker: 'ALPHA', groups: ['Alpha']},
    {ticker: 'OMEGA', groups: ['Beta']},
  ]
  const sections = groupItems(groupedItems, 'group', new Date('2026-06-17T12:00:00Z'), 'down')
  const alpha = sections.find((section) => section.group === 'Alpha')

  assert.ok(alpha)
  assert.deepEqual(alpha.items.map((item) => item.ticker), [
    'ALPHA',
    'ZETA',
  ])
})
