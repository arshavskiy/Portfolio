const fs = require('fs')
const YahooFinance = require('yahoo-finance2').default
const yf = new YahooFinance({suppressNotices: ['yahooSurvey', 'ripHistorical']})
const out = []
;(async () => {
    // 1) news via search
    try {
        const r = await yf.search('stock market', {newsCount: 6, quotesCount: 0})
        const news = r.news || []
        out.push('search news count: ' + news.length)
        if (news[0]) out.push('sample keys: ' + Object.keys(news[0]).join(','))
        news.slice(0, 3).forEach((n) => {
            out.push(`- "${(n.title || '').slice(0, 50)}" | pub:${n.publisher} | thumb:${n.thumbnail ? 'yes' : 'no'} | url:${n.link ? 'yes' : 'no'}`)
            if (n.thumbnail) out.push('  thumb resolutions: ' + JSON.stringify((n.thumbnail.resolutions || []).map((x) => x.width + 'x' + x.height)))
        })
    } catch (e) {
        out.push('search news ERR: ' + e.message)
    }
    fs.writeFileSync('_newsout.txt', out.join('\n'))
    process.exit(0)
})()
