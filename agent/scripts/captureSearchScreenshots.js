const {captureSearchScreenshots} = require('../lib/searchScreenshots')

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})

async function main() {
    const result = await captureSearchScreenshots()
    console.log(`Done. Captured=${result.captured}, failed=${result.failed}`)
    console.log(`Report saved to ${result.runLog}`)
    
    for (const item of result.screenshots) {
        console.log(`- ${item.label}: ${item.screenshot}`)
    }
}
