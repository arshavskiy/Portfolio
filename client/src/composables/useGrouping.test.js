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
    'NO-HISTORY',
    'RANGE-WINNER',
  ])

  assert.deepEqual(postSection.items.map((item) => item.ticker), [
    'RANGE-WINNER',
    'NO-HISTORY',
    'API-WINNER',
  ])
})

test('pre and post grouping derive extended percent from price and change when percent is missing', () => {
  const derivedItems = [
    {
      ticker: 'PRE-DERIVED',
      preMarketPrice: 103,
      preMarketChange: 3,
    },
    {
      ticker: 'PRE-EXPLICIT',
      preMarketChangePercent: 2,
    },
    {
      ticker: 'POST-DERIVED',
      postMarketPrice: 94,
      postMarketChange: -6,
    },
    {
      ticker: 'POST-EXPLICIT',
      postMarketChangePercent: -4,
    },
  ]

  const [preSection] = groupItems(derivedItems, 'pre', new Date('2026-06-17T12:00:00Z'), 'down')
  const [postSection] = groupItems(derivedItems, 'post', new Date('2026-06-17T12:00:00Z'), 'up')

  assert.deepEqual(preSection.items.map((item) => item.ticker), [
    'PRE-DERIVED',
    'PRE-EXPLICIT',
    'POST-DERIVED',
    'POST-EXPLICIT',
  ])

  assert.deepEqual(postSection.items.map((item) => item.ticker), [
    'POST-DERIVED',
    'POST-EXPLICIT',
    'PRE-DERIVED',
    'PRE-EXPLICIT',
  ])
})

test('extended grouping follows the same active session choice as the watch row', () => {
  const extendedItems = [
    {
      ticker: 'US-PRE',
      marketState: 'REGULAR',
      preMarketChangePercent: 4,
      postMarketChangePercent: 9,
    },
    {
      ticker: 'US-POST',
      marketState: 'POST',
      preMarketChangePercent: 1,
      postMarketChangePercent: 5,
    },
    {
      ticker: 'BTC-USD',
      marketState: 'REGULAR',
      preMarketChangePercent: 11,
      postMarketChangePercent: 2,
    },
  ]

  const [section] = groupItems(extendedItems, 'extended', new Date('2026-06-17T15:00:00Z'), 'down')

  assert.deepEqual(section.items.map((item) => item.ticker), [
    'US-POST',
    'US-PRE',
    'BTC-USD',
  ])
})

test('pre and post grouping treat rows without usable extended values as neutral zero', () => {
  const filteredItems = [
    {
      ticker: 'HAS-PRE',
      preMarketChangePercent: 1.5,
    },
    {
      ticker: 'HAS-POST',
      postMarketPrice: 98,
      postMarketChange: -2,
    },
    {
      ticker: 'NO-EXT',
      changePercent: 12,
    },
  ]

  const [preSection] = groupItems(filteredItems, 'pre', new Date('2026-06-17T12:00:00Z'), 'down')
  const [postSection] = groupItems(filteredItems, 'post', new Date('2026-06-17T12:00:00Z'), 'down')

  assert.deepEqual(preSection.items.map((item) => item.ticker), ['HAS-PRE', 'HAS-POST', 'NO-EXT'])
  assert.deepEqual(postSection.items.map((item) => item.ticker), ['HAS-PRE', 'NO-EXT', 'HAS-POST'])
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
