export const MARKET_HOURS_BY_GROUP = {
    US: {
        key: 'us',
        name: 'NYSE',
        city: 'New York',
        timezone: 'America/New_York',
        days: [1, 2, 3, 4, 5],
        sessions: [{start: '09:30', end: '16:00'}],
        extendedSessions: [
            {label: 'Pre', start: '04:00', end: '09:30'},
            {label: 'Post', start: '16:00', end: '20:00'},
        ],
    },
    Israel: {
        key: 'israel',
        name: 'TASE',
        city: 'Tel Aviv',
        timezone: 'Asia/Jerusalem',
        days: [1, 2, 3, 4, 5],
        sessionsByDay: {
            1: [{start: '10:00', end: '17:35'}],
            2: [{start: '10:00', end: '17:35'}],
            3: [{start: '10:00', end: '17:35'}],
            4: [{start: '10:00', end: '17:35'}],
            5: [{start: '10:00', end: '13:50'}],
        },
        sessions: [{start: '10:00', end: '17:35'}],
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

function marketForTicker(ticker) {
    const symbol = (ticker || '').toUpperCase()
    if (/-USD$/.test(symbol)) return MARKET_HOURS_BY_GROUP.Crypto
    if (/\.TA$/.test(symbol)) return MARKET_HOURS_BY_GROUP.Israel
    return MARKET_HOURS_BY_GROUP.US
}

// True when the given timestamp falls inside the ticker's regular trading
// session (excludes pre/after-market). Crypto is always regular (24/7).
export function isRegularSessionBar(date, ticker) {
    const market = marketForTicker(ticker)
    if (market === MARKET_HOURS_BY_GROUP.Crypto) return true

    const parts = timeParts(new Date(date), market.timezone)
    if (!market.days.includes(parts.weekday)) return false

    const sessions = market.sessionsByDay?.[parts.weekday] || market.sessions || []
    const mins = (parts.hour * 60) + parts.minute
    return sessions.some((s) => mins >= toMinutes(s.start) && mins < toMinutes(s.end))
}

function formatClock(date, timezone) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date)
}

function dateParts(date, timezone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date)

    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        hour: Number(map.hour),
        minute: Number(map.minute),
    }
}

function zonedDateTimeToDate({year, month, day, hour, minute}, timezone) {
    const guess = new Date(Date.UTC(year, month - 1, day, hour, minute))
    const actual = dateParts(guess, timezone)
    const desiredUtc = Date.UTC(year, month - 1, day, hour, minute)
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute)
    return new Date(guess.getTime() + (desiredUtc - actualUtc))
}

function addDaysInTimezone(date, timezone, dayOffset) {
    const parts = dateParts(new Date(date.getTime() + dayOffset * 86400000), timezone)
    return {year: parts.year, month: parts.month, day: parts.day}
}

function localSessionTimes(market, date, sessions) {
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const parts = timeParts(date, market.timezone)

    let referenceOffset = 0
    while (referenceOffset < 8 && !market.days.includes((parts.weekday + referenceOffset) % 7)) {
        referenceOffset += 1
    }

    const baseDay = addDaysInTimezone(date, market.timezone, referenceOffset)
    return sessions.map((session) => {
        const [startHour, startMinute] = session.start.split(':').map(Number)
        const [endHour, endMinute] = session.end.split(':').map(Number)
        const startDate = zonedDateTimeToDate({...baseDay, hour: startHour, minute: startMinute}, market.timezone)
        const endDate = zonedDateTimeToDate({...baseDay, hour: endHour % 24, minute: endMinute}, market.timezone)
        return {
            start: formatClock(startDate, localTimezone),
            end: formatClock(endDate, localTimezone),
        }
    })
}

function formatLocalSessionLabel(market, date, sessions) {
    const regularLabel = localSessionTimes(market, date, sessions)
        .map((session) => `<strong>${session.start}</strong>-<strong>${session.end}</strong>`)
        .join(' , ')

    if (!market.extendedSessions?.length) return regularLabel

    const extendedState = getExtendedSessionState(market, date, sessions)
    const extendedLabel = extendedState?.label
        ? formatExtendedSessionLabel(market, date, extendedState)
        : ''

    if (!extendedLabel) return regularLabel

    return `${regularLabel} (${extendedLabel})`
}

function formatExtendedSessionLabel(market, date, extendedState) {
    const session = market.extendedSessions.find((item) => item.label === extendedState.label)
    if (!session) return ''

    const [localSession] = localSessionTimes(market, date, [session])
    if (!localSession) return ''

    if (extendedState.label === 'Pre') {
        return `Pre-Market <strong>${localSession.start}</strong>-<strong>${localSession.end}</strong>`
    }

    if (extendedState.label === 'Post') {
        return ` <strong>${localSession.start}</strong>-<strong>${localSession.end}</strong>`
    }

    return `<strong>${localSession.start}</strong>-<strong>${localSession.end}</strong>`
}

function formatDuration(totalMinutes) {
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return ''
    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60
    if (days > 0) {
        if (hours === 0) return `${days}d`
        return `${days}d ${hours}h`
    }
    if (hours <= 0) return `${minutes}m`
    if (minutes === 0) return `${hours}h`
    return `${hours}h ${minutes}m`
}

function getExtendedSessionState(market, date, sessions) {
    if (!market.extendedSessions?.length || !sessions.length) return null

    const parts = timeParts(date, market.timezone)
    const isTradingDay = market.days.includes(parts.weekday)
    if (!isTradingDay) return null

    const currentMinutes = (parts.hour * 60) + parts.minute
    const regularStart = sessions[0]?.startMinutes
    const regularEnd = sessions[sessions.length - 1]?.endMinutes
    const extendedSessions = market.extendedSessions.map((session) => ({
        ...session,
        startMinutes: toMinutes(session.start),
        endMinutes: toMinutes(session.end),
    }))
    const preSession = extendedSessions.find((session) => session.label === 'Pre')
    const postSession = extendedSessions.find((session) => session.label === 'Post')

    const activeExtended = extendedSessions.find((session) => currentMinutes >= session.startMinutes && currentMinutes < session.endMinutes)
    if (activeExtended?.label === 'Pre') {
        return {
            label: 'Pre',
            isActive: true,
            remainingMinutes: activeExtended.endMinutes - currentMinutes,
        }
    }

    if (activeExtended?.label === 'Post') {
        return {
            label: 'Post',
            isActive: true,
            remainingMinutes: activeExtended.endMinutes - currentMinutes,
        }
    }

    if (preSession && currentMinutes < preSession.startMinutes) {
        return {
            label: 'Pre',
            untilStartMinutes: preSession.startMinutes - currentMinutes,
        }
    }

    if (currentMinutes < regularEnd) {
        return {
            label: 'Post',
            untilEndMinutes: postSession ? postSession.endMinutes - currentMinutes : regularEnd - currentMinutes,
        }
    }

    return null
}

function nextSessionOpen(market, weekday, currentMinutes, sessions) {
    for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
        const day = (weekday + dayOffset) % 7
        if (!market.days.includes(day)) continue

        const daySessions = (market.sessionsByDay?.[day] || market.sessions || []).map((session) => ({
            ...session,
            startMinutes: toMinutes(session.start),
            endMinutes: toMinutes(session.end),
        }))

        for (const session of daySessions) {
            if (dayOffset === 0 && session.startMinutes <= currentMinutes) continue
            return {
                inMinutes: (dayOffset * 1440) + (session.startMinutes - currentMinutes),
            }
        }
    }
    
    return null
}

function nextExtendedSessionStart(market, weekday, currentMinutes, label) {
    if (!market.extendedSessions?.length) return null

    for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
        const day = (weekday + dayOffset) % 7
        if (!market.days.includes(day)) continue

        const session = market.extendedSessions.find((item) => item.label === label)
        if (!session) return null

        const startMinutes = toMinutes(session.start)
        if (dayOffset === 0 && startMinutes <= currentMinutes) continue

        return {
            inMinutes: (dayOffset * 1440) + (startMinutes - currentMinutes),
        }
    }

    return null
}

export function getMarketHoursState(market, date = new Date()) {
    if (!market) return null
    
    const parts = timeParts(date, market.timezone)
    const currentMinutes = (parts.hour * 60) + parts.minute
    const baseSessions = market.sessionsByDay?.[parts.weekday] || market.sessions || []
    const sessions = baseSessions.map((session) => ({
        ...session,
        startMinutes: toMinutes(session.start),
        endMinutes: toMinutes(session.end),
    }))
    
    const isTradingDay = market.days.includes(parts.weekday)
    const activeSession = isTradingDay
        ? sessions.find((session) => currentMinutes >= session.startMinutes && currentMinutes < session.endMinutes)
        : null
    
    const nextOpen = nextSessionOpen(market, parts.weekday, currentMinutes, sessions)
    const nextPreMarket = nextExtendedSessionStart(market, parts.weekday, currentMinutes, 'Pre')
    const extendedState = getExtendedSessionState(market, date, sessions)
    
    let nextLabel = 'Closed'
    let statusLabel = activeSession ? 'Open' : 'Closed'
    let statusTone = activeSession ? 'open' : 'closed'

    if (market.key === 'us') {
        if (extendedState?.label === 'Pre') {
            nextLabel = extendedState.isActive
                ? `Regular in ${formatDuration(extendedState.remainingMinutes)}`
                : `Pre-Market in ${formatDuration(extendedState.untilStartMinutes)}`
            statusLabel = extendedState.isActive ? 'Pre-Market ' : 'Before Trade'
            statusTone = extendedState.isActive ? 'phase' : 'closed'
        } else if (activeSession) {
            nextLabel = `After-Hours in ${formatDuration(activeSession.endMinutes - currentMinutes)}`
            statusLabel = 'Open'
            statusTone = 'open'
        } else if (extendedState?.label === 'Post' && extendedState.isActive) {
            nextLabel = `Closed in ${formatDuration(extendedState.remainingMinutes)}`
            statusLabel = 'After-Hours '
            statusTone = 'phase'
        } else {
            nextLabel = nextPreMarket ? `Pre-Market in ${formatDuration(nextPreMarket.inMinutes)}` : 'After Trade'
            statusLabel = 'Closed'
            statusTone = 'closed'
        }
    } else {
        if (extendedState?.label === 'Pre') {
            nextLabel = extendedState.isActive
                ? `Pre until ${formatDuration(extendedState.remainingMinutes)}`
                : `Pre in ${formatDuration(extendedState.untilStartMinutes)}`
        } else if (activeSession) nextLabel = `Regular until ${formatDuration(activeSession.endMinutes - currentMinutes)}`
        else if (extendedState?.label === 'Post' && extendedState.isActive) nextLabel = `Post until ${formatDuration(extendedState.remainingMinutes)}`
        else if (nextOpen) nextLabel = `Opens in ${formatDuration(nextOpen.inMinutes)}`
    }
    
    return {
        ...market,
        localTime: formatClock(date, market.timezone),
        isOpen: Boolean(activeSession),
        statusLabel,
        statusTone,
        nextLabel,
        closeLabel: localSessionTimes(market, date, sessions).slice(-1)[0]?.end || null,
        sessionLabel: formatLocalSessionLabel(market, date, sessions),
    }
}
