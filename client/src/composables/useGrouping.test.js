import test from 'node:test'
import assert from 'node:assert/strict'
import {groupItems} from './useGrouping.js'

const items = [
  {
    ticker: 'API-WINNER',
    changePercent: 8,
    history: [{close: 100}, {close: 90}],
  },
  {
    ticker: 'RANGE-WINNER',
    changePercent: -5,
    history: [{close: 100}, {close: 115}],
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
