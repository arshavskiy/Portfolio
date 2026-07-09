const fs = require('node:fs/promises')
const path = require('node:path')
const {runDiscovery} = require('../lib/discovery')

const DATA_DIR = path.join(__dirname, '..', 'data')
const REPORTS_DIR = path.join(DATA_DIR, 'overnight-discovery')

const DEFAULT_HOURS = 8
const DEFAULT_INTERVAL_MINUTES = 45
const DEFAULT_LIMIT_PER_QUERY = 10

let stopping = false

function numberFromEnv(name, fallback) {
    const value = Number(process.env[name])
    return Number.isFinite(value) && value > 0 ? value : fallback
}

function timestamp() {
    return new Date().toISOString()
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.round(ms / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours) return `${hours}h ${minutes}m`
    if (minutes) return `${minutes}m ${seconds}s`
    return `${seconds}s`
}

async function writeReport(report) {
    await fs.mkdir(REPORTS_DIR, {recursive: true})
    const reportPath = path.join(REPORTS_DIR, `${report.startedAt.replace(/[:.]/g, '-')}.json`)
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    await fs.writeFile(path.join(REPORTS_DIR, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    return reportPath
}

function summarizeRound(round, result) {
    const rejectionText = Object.entries(result.rejections || {})
        .map(([reason, count]) => `${reason}:${count}`)
        .join(', ') || 'none'
    
    console.log(
        `[${timestamp()}] round ${round}: scanned=${result.scanned} added=${result.added} updated=${result.updated} rejected=${result.rejected} total=${result.total} rejections=${rejectionText}`
    )
    
    if (result.errors?.length) {
        for (const error of result.errors) {
            console.log(`  warning: ${error.query}: ${error.message}`)
        }
    }
}

async function main() {
    const hours = numberFromEnv('DISCOVERY_HOURS', DEFAULT_HOURS)
    const intervalMinutes = numberFromEnv('DISCOVERY_INTERVAL_MINUTES', DEFAULT_INTERVAL_MINUTES)
    const limitPerQuery = numberFromEnv('DISCOVERY_LIMIT_PER_QUERY', DEFAULT_LIMIT_PER_QUERY)
    const maxRounds = numberFromEnv('DISCOVERY_MAX_ROUNDS', Math.ceil((hours * 60) / intervalMinutes))
    const intervalMs = intervalMinutes * 60 * 1000
    const startedAt = timestamp()
    const report = {
        startedAt,
        finishedAt: null,
        config: {
            hours,
            intervalMinutes,
            limitPerQuery,
            maxRounds,
        },
        totals: {
            scanned: 0,
            added: 0,
            updated: 0,
            rejected: 0,
            errors: 0,
        },
        rounds: [],
    }
    
    console.log('StockFolio overnight discovery')
    console.log('Manual-review mode only: no login, no private scraping, no auto-posting.')
    console.log(`Config: ${maxRounds} rounds, ${intervalMinutes}m apart, ${limitPerQuery} results/query`)
    console.log('Stop safely with Ctrl+C.')
    
    for (let round = 1; round <= maxRounds && !stopping; round++) {
        const roundStartedAt = timestamp()
        
        try {
            const result = await runDiscovery({limitPerQuery})
            summarizeRound(round, result)
            
            report.totals.scanned += result.scanned || 0
            report.totals.added += result.added || 0
            report.totals.updated += result.updated || 0
            report.totals.rejected += result.rejected || 0
            report.totals.errors += result.errors?.length || 0
            report.rounds.push({
                round,
                startedAt: roundStartedAt,
                finishedAt: timestamp(),
                scanned: result.scanned || 0,
                added: result.added || 0,
                updated: result.updated || 0,
                rejected: result.rejected || 0,
                rejections: result.rejections || {},
                errors: result.errors || [],
                runLog: result.runLog || '',
            })
        } catch (error) {
            console.log(`[${timestamp()}] round ${round} failed: ${error.message}`)
            report.totals.errors += 1
            report.rounds.push({
                round,
                startedAt: roundStartedAt,
                finishedAt: timestamp(),
                error: error.message,
            })
        }
        
        await writeReport({...report, finishedAt: timestamp()})
        
        if (round < maxRounds && !stopping) {
            console.log(`[${timestamp()}] sleeping ${formatDuration(intervalMs)} before next discovery round...`)
            await sleep(intervalMs)
        }
    }
    
    report.finishedAt = timestamp()
    const reportPath = await writeReport(report)
    console.log(`Done. Overnight report saved to ${reportPath}`)
}

process.on('SIGINT', () => {
    stopping = true
    console.log('\nStopping after the current wait/round...')
})

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
