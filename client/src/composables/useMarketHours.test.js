import test from 'node:test'
import assert from 'node:assert/strict'
import {getMarketHoursState, MARKET_HOURS_BY_GROUP} from './useMarketHours.js'

const usMarket = MARKET_HOURS_BY_GROUP.US

test('US market before pre-market shows next pre-market stage', () => {
  const state = getMarketHoursState(usMarket, new Date('2026-06-12T06:00:00Z'))

  assert.equal(state.statusLabel, 'Before Trade')
  assert.equal(state.nextLabel, 'Pre-Market in 2h')
})

test('US market during pre-market shows trading-hours countdown', () => {
  const state = getMarketHoursState(usMarket, new Date('2026-06-12T12:00:00Z'))

  assert.equal(state.statusLabel, 'Pre-Market Trading')
  assert.equal(state.nextLabel, 'Regular in 1h 30m')
})

test('US market during regular trading shows after-hours countdown', () => {
  const state = getMarketHoursState(usMarket, new Date('2026-06-12T15:00:00Z'))

  assert.equal(state.statusLabel, 'Open')
  assert.equal(state.nextLabel, 'After-Hours in 5h')
})

test('US market during after-hours shows close countdown', () => {
  const state = getMarketHoursState(usMarket, new Date('2026-06-12T21:00:00Z'))

  assert.equal(state.statusLabel, 'After-Hours Trading')
  assert.equal(state.nextLabel, 'Closed in 3h')
})

test('US market after after-hours points to the next pre-market stage', () => {
  const state = getMarketHoursState(usMarket, new Date('2026-06-13T01:00:00Z'))

  assert.equal(state.statusLabel, 'Closed')
  assert.equal(state.nextLabel, 'Pre-Market in 2d 7h')
})
