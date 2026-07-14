// XIRR via Newton's method over irregular dated cash flows. Buys/inflows are
// negative (money leaving the investor), sells/dividends/terminal value are
// positive. Falls back to bisection if Newton's method fails to converge —
// XIRR's derivative can be poorly behaved for pathological cash-flow shapes.
function computeXirr(cashFlows) {
    const flows = cashFlows.filter((f) => f.amount !== 0)
    if (flows.length < 2) return null
    
    const t0 = new Date(flows[0].date).getTime()
    const years = flows.map((f) => (new Date(f.date).getTime() - t0) / (365 * 86400000))
    
    function npv(rate) {
        return flows.reduce((sum, f, i) => sum + f.amount / Math.pow(1 + rate, years[i]), 0)
    }
    
    function dnpv(rate) {
        return flows.reduce((sum, f, i) => (years[i] === 0 ? sum : sum - years[i] * f.amount / Math.pow(1 + rate, years[i] + 1)), 0)
    }
    
    let rate = 0.1
    for (let i = 0; i < 100; i++) {
        const value = npv(rate)
        const deriv = dnpv(rate)
        if (Math.abs(deriv) < 1e-10) break
        const nextRate = rate - value / deriv
        if (!Number.isFinite(nextRate) || nextRate <= -1) break
        if (Math.abs(nextRate - rate) < 1e-7) return nextRate
        rate = nextRate
    }
    
    // Bisection fallback over a wide bracket.
    let lo = -0.99, hi = 10
    let npvLo = npv(lo), npvHi = npv(hi)
    if (Number.isNaN(npvLo) || Number.isNaN(npvHi) || npvLo * npvHi > 0) return null
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2
        const npvMid = npv(mid)
        if (Math.abs(npvMid) < 1e-6) return mid
        if (npvLo * npvMid < 0) {
            hi = mid;
            npvHi = npvMid
        } else {
            lo = mid;
            npvLo = npvMid
        }
    }
    return (lo + hi) / 2
}

// TWR chain-links daily sub-period returns from a {date, value, cost} series
// (as produced by historyService.getPortfolioHistory). Each day's return is
// value(t)/value(t-1) - 1, chain-linked — day-granularity is the finest the
// underlying history series offers, so this is the standard daily-TWR
// approximation rather than an exact break-at-each-flow calc.
function computeTwr(dailySeries) {
    if (!dailySeries || dailySeries.length < 2) return null
    
    let growth = 1
    let prevValue = null
    
    for (const point of dailySeries) {
        if (prevValue == null) {
            prevValue = point.value
            continue
        }
        // Skip sub-periods starting from a $0 base (pre-first-buy) to avoid
        // divide-by-zero; they contribute no return information anyway.
        if (prevValue > 0) {
            const periodReturn = point.value / prevValue - 1
            if (Number.isFinite(periodReturn)) growth *= 1 + periodReturn
        }
        prevValue = point.value
    }
    
    return (growth - 1) * 100
}

module.exports = {computeXirr, computeTwr}
