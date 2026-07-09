const {runPublicScrape} = require('../lib/publicScrape')

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})

async function main() {
    const result = await runPublicScrape()
    console.log(`Done. Scraped=${result.scraped}, skipped=${result.skipped}, failed=${result.failed}`)
    console.log(`Report saved to ${result.runLog}`)
}
