const test = require('node:test')
const assert = require('node:assert/strict')
const {
    buildCandidate,
    inferCanonicalId,
    inferOutreachStrategy,
    parseDuckDuckGoResults,
} = require('./discovery')

test('parseDuckDuckGoResults extracts decoded public results', () => {
    const html = `
    <div class="result results_links">
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fwww.reddit.com%2Fr%2Finvesting%2F">Reddit - r/investing</a>
      <a class="result__snippet">A community with 2.9m members for stock market discussion.</a>
    </div>
  `
    
    assert.deepEqual(parseDuckDuckGoResults(html), [
        {
            title: 'Reddit - r/investing',
            url: 'https://www.reddit.com/r/investing/',
            snippet: 'A community with 2.9m members for stock market discussion.',
        },
    ])
})

test('buildCandidate enriches a strong community result', () => {
    const {candidate, rejection} = buildCandidate({
        title: 'Reddit - r/stocks',
        url: 'https://www.reddit.com/r/stocks/',
        snippet: 'A stock market subreddit with 7.6m members for investing and portfolio discussion.',
    }, {
        label: 'Reddit investing communities',
        platform: 'reddit',
        language: 'en',
    })
    
    assert.equal(rejection, null)
    assert.equal(candidate.platform, 'reddit')
    assert.equal(candidate.canonicalId, 'reddit:r/stocks')
    assert.equal(candidate.language, 'en')
    assert.equal(candidate.members, 7600000)
    assert.equal(candidate.review, 'pending')
    assert.equal(candidate.status, 'new')
    assert.equal(candidate.outreachStrategy, 'ask-mods')
    assert.ok(candidate.confidence >= 70)
})

test('buildCandidate recognizes Russian-language community results', () => {
    const {candidate, rejection} = buildCandidate({
        title: 'Форум инвесторов и трейдеров',
        url: 'https://forum.example.com/investors',
        snippet: 'Русскоязычное сообщество об инвестициях, акциях и криптовалюте с 12k участников.',
    }, {
        label: 'Russian investing forums',
        platform: 'forum',
        language: 'ru',
    })
    
    assert.equal(rejection, null)
    assert.equal(candidate.platform, 'forum')
    assert.equal(candidate.language, 'ru')
    assert.equal(candidate.members, 12000)
    assert.ok(candidate.confidence >= 60)
})

test('buildCandidate rejects low-signal pages with a reason', () => {
    const {candidate, rejection} = buildCandidate({
        title: 'Facebook Login',
        url: 'https://www.facebook.com/login',
        snippet: '',
    }, {
        label: 'Facebook Israeli investors',
        platform: 'facebook',
        language: 'he',
    })
    
    assert.equal(candidate, null)
    assert.equal(rejection.reason, 'login-page')
})

test('buildCandidate rejects yandex search pages', () => {
    const {candidate, rejection} = buildCandidate({
        title: 'Яндекс: нашлось 1 млн результатов',
        url: 'https://yandex.ru/search/?text=инвестиции',
        snippet: 'Поиск по запросу инвестиции',
    }, {
        label: 'Yandex Russian investing discussions',
        platform: 'forum',
        language: 'ru',
    })
    
    assert.equal(candidate, null)
    assert.equal(rejection.reason, 'search-page')
})

test('inferOutreachStrategy detects promotional restrictions', () => {
    const strategy = inferOutreachStrategy(
        {platform: 'forum', posting: 'Restricted', notes: 'No self promotion. Use the weekly feedback thread.'},
        'No self promotion'
    )
    
    assert.equal(strategy, 'do-not-post')
})

test('inferCanonicalId normalizes platform community identifiers', () => {
    assert.equal(inferCanonicalId('https://www.reddit.com/r/investing/top/', 'reddit', 'r/investing'), 'reddit:r/investing')
    assert.equal(inferCanonicalId('https://t.me/cryptoSignals', 'telegram', 'Crypto Signals'), 'telegram:cryptosignals')
    assert.equal(inferCanonicalId('https://www.facebook.com/groups/123456789/', 'facebook', 'Investors'), 'facebook:group:123456789')
})
