const {runDiscovery} = require('../lib/discovery')

runDiscovery()
    .then((result) => {
        console.log(`Scanned ${result.scanned} candidates`)
        console.log(`Added ${result.added}, updated ${result.updated}, total ${result.total}`)
        
        if (result.errors.length) {
            console.log('Search errors:')
            for (const error of result.errors) {
                console.log(`- ${error.query}: ${error.message}`)
            }
        }
    })
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
