import * as XLSX from 'xlsx'

// Parse an uploaded file (.xlsx/.xls/.csv/.docx) into an array of row objects
// keyed by normalized lower-case header names. Returns { headers, rows }.
export async function parseFile(file) {
    const name = file.name.toLowerCase()
    if (name.endsWith('.docx')) return parseDocx(file)
    return parseSheet(file)
}

function normalizeHeader(h) {
    return String(h ?? '').trim().toLowerCase()
}

// XLSX / XLS / CSV via SheetJS.
async function parseSheet(file) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, {type: 'array'})
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) return {headers: [], rows: []}
    const matrix = XLSX.utils.sheet_to_json(sheet, {header: 1, blankrows: false, defval: ''})
    return matrixToRows(matrix)
}

// DOCX: extract the first table via mammoth → HTML, then read the table cells.
async function parseDocx(file) {
    const mammoth = (await import('mammoth')).default || (await import('mammoth'))
    const buf = await file.arrayBuffer()
    const {value: html} = await mammoth.convertToHtml({arrayBuffer: buf})
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const table = doc.querySelector('table')
    if (!table) {
        throw new Error('No table found in the Word document. Use a document with a real table, or export to .xlsx/.csv.')
    }
    const matrix = [...table.querySelectorAll('tr')].map((tr) =>
        [...tr.querySelectorAll('th,td')].map((c) => c.textContent.trim())
    )
    return matrixToRows(matrix)
}

// A 2D matrix (first row = headers) → { headers, rows: [{header: value}] }.
function matrixToRows(matrix) {
    if (!matrix.length) return {headers: [], rows: []}
    const headers = matrix[0].map(normalizeHeader)
    const rows = []
    for (let i = 1; i < matrix.length; i++) {
        const cells = matrix[i]
        if (!cells || cells.every((c) => c === '' || c == null)) continue
        const row = {}
        headers.forEach((h, j) => {
            if (h) row[h] = cells[j]
        })
        rows.push(row)
    }
    return {headers: headers.filter(Boolean), rows}
}

// Header aliases → canonical field. Used to auto-map columns.
const FIELD_ALIASES = {
    ticker: ['ticker', 'symbol', 'stock', 'security', 'instrument'],
    companyName: ['name', 'company', 'companyname', 'company name', 'description'],
    shares: ['shares', 'quantity', 'qty', 'units', 'amount'],
    price: ['price', 'cost', 'avg cost', 'avgcost', 'average cost', 'buy price', 'unit price', 'price per share'],
    date: ['date', 'buy date', 'purchase date', 'trade date'],
    groups: ['group', 'groups', 'tag', 'tags', 'category', 'sector'],
}

// Given the file's headers, guess which header maps to each canonical field.
export function autoMap(headers) {
    const map = {}
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        const hit = headers.find((h) => aliases.includes(h))
        if (hit) map[field] = hit
    }
    return map
}

function num(v) {
    if (v == null || v === '') return null
    const n = Number(String(v).replace(/[$,₪\s]/g, ''))
    return Number.isFinite(n) ? n : null
}

// Generate and download a pre-formatted template .xlsx for the given mode.
export function downloadTemplate(mode) {
    const data = mode === 'holdings'
        ? [
            ['Ticker', 'Shares', 'Price', 'Date', 'Groups'],
            ['AAPL', 10, 150.25, '2026-01-15', 'Tech'],
            ['MSFT', 5, 300, '2026-02-01', 'Tech;Long-term'],
            ['POLI.TA', 100, 1850, '2026-03-10', 'Israel'],
        ]
        : [
            ['Ticker'],
            ['GOOGL'],
            ['TSLA'],
            ['TEVA.TA'],
        ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, mode === 'holdings' ? 'Holdings' : 'Watchlist')
    XLSX.writeFile(wb, `stockfolio-${mode}-template.xlsx`)
}

// Export a list of tickers as a CSV in the watchlist template format
// (single "Ticker" column). Re-importable via the Import Watchlist flow.
export function exportWatchlistCsv(tickers) {
    const rows = [['Ticker'], ...tickers.map((t) => [t])]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const csv = XLSX.utils.sheet_to_csv(ws)
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'stockfolio-watchlist.csv'
    a.click()
    URL.revokeObjectURL(url)
}

// Convert parsed rows into normalized records using a field→header map.
// mode: 'watchlist' (ticker only) | 'holdings' (ticker+shares+price required).
export function mapRows(rows, map, mode) {
    const out = []
    for (const r of rows) {
        const ticker = String(r[map.ticker] ?? '').trim().toUpperCase()
        if (!ticker) continue
        
        const rec = {
            ticker,
            companyName: map.companyName ? String(r[map.companyName] ?? '').trim() : '',
            groups: map.groups
                ? String(r[map.groups] ?? '').split(/[,;|]/).map((g) => g.trim()).filter(Boolean)
                : [],
        }
        
        if (mode === 'holdings') {
            rec.shares = num(r[map.shares])
            rec.price = num(r[map.price])
            rec.date = map.date && r[map.date] ? r[map.date] : null
            rec.valid = !!rec.ticker && rec.shares > 0 && rec.price > 0
            rec.error = rec.valid ? '' : 'Needs ticker, shares > 0, price > 0'
        } else {
            rec.valid = !!rec.ticker
            rec.error = rec.valid ? '' : 'Missing ticker'
        }
        out.push(rec)
    }
    return out
}
