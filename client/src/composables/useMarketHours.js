export const MARKET_HOURS_BY_GROUP = {
    US: {
        key: 'us',
        name: 'NYSE',
        city: 'New York',
        timezone: 'America/New_York',
        days: [1, 2, 3, 4, 5],
        sessions: [{start: '09:30', end: '16:00'}],
    },
    Israel: {
        key: 'israel',
        name: 'TASE',
        city: 'Tel Aviv',
        timezone: 'Asia/Jerusalem',
        days: [0, 1, 2, 3, 4],
        sessions: [{start: '09:59', end: '17:25'}],
    },
    Europe: {
        key: 'europe',
        name: 'LSE',
        city: 'London',
        timezone: 'Europe/London',
        days: [1, 2, 3, 4, 5],
        sessions: [{start: '08:00', end: '16:30'}],
    },
    Asia: {
        key: 'asia',
        name: 'TSE',
        city: 'Tokyo',
        timezone: 'Asia/Tokyo',
        days: [1, 2, 3, 4, 5],
        sessions: [
            {start: '09:00', end: '11:30'},
            {start: '12:30', end: '15:30'},
        ],
    },
    Crypto: {
        key: 'crypto',
        name: 'Crypto',
        city: '24/7',
        timezone: 'UTC',
        days: [0, 1, 2, 3, 4, 5, 6],
        sessions: [{start: '00:00', end: '24:00'}],
    },
}

export const MARKET_HOURS_LIST = ['US', 'Israel', 'Europe', 'Asia']
    .map((key) => MARKET_HOURS_BY_GROUP[key])
    .filter(Boolean)

function timeParts(date, timezone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date)
    
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const weekdayMap = {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6}
    return {
        weekday: weekdayMap[map.weekday],
        hour: Number(map.hour),
        minute: Number(map.minute),
    }
}

function toMinutes(value) {
    const [hour, minute] = value.split(':').map(Number)
    return (hour * 60) + minute
}

function formatClock(date, timezone) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
    }).format(date)
}

function formatDuration(totalMinutes) {
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return ''
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours <= 0) return `${minutes}m`
    if (minutes === 0) return `${hours}h`
    return `${hours}h ${minutes}m`
}

function nextSessionOpen(market, weekday, currentMinutes, sessions) {
    for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
        const day = (weekday + dayOffset) % 7
        if (!market.days.includes(day)) continue
        
        for (const session of sessions) {
            if (dayOffset === 0 && session.startMinutes <= currentMinutes) continue
            return {
                inMinutes: (dayOffset * 1440) + (session.startMinutes - currentMinutes),
            }
        }
    }
    
    return null
}

export function getMarketHoursState(market, date = new Date()) {
    if (!market) return null
    
    const parts = timeParts(date, market.timezone)
    const currentMinutes = (parts.hour * 60) + parts.minute
    const sessions = market.sessions.map((session) => ({
        ...session,
        startMinutes: toMinutes(session.start),
        endMinutes: toMinutes(session.end),
    }))
    
    const isTradingDay = market.days.includes(parts.weekday)
    const activeSession = isTradingDay
        ? sessions.find((session) => currentMinutes >= session.startMinutes && currentMinutes < session.endMinutes)
        : null
    
    const nextOpen = nextSessionOpen(market, parts.weekday, currentMinutes, sessions)
    
    let nextLabel = 'Closed'
    if (activeSession) nextLabel = `Closes ${activeSession.end}`
    else if (nextOpen) nextLabel = `Opens in ${formatDuration(nextOpen.inMinutes)}`
    
    return {
        ...market,
        localTime: formatClock(date, market.timezone),
        isOpen: Boolean(activeSession),
        nextLabel,
        sessionLabel: sessions.map((session) => `${session.start}-${session.end}`).join(' , '),
    }
}
