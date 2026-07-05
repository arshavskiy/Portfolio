function scoreCommunity(community) {
  const posting = community.posting || 'Check rules'
  const policyScore = posting === 'Usually allowed' ? 100 : posting === 'Restricted' ? 35 : 70
  const memberScore = Math.min(100, Math.round(Math.log10(Math.max(community.members || 0, 10)) * 18))
  const relevance = community.relevance ?? inferRelevance(community)
  const activity = community.activity ?? inferActivity(community)

  return Math.round((relevance * 0.42) + (activity * 0.26) + (memberScore * 0.18) + (policyScore * 0.14))
}

function inferRelevance(community) {
  const text = `${community.name || ''} ${community.notes || ''} ${community.url || ''}`.toLowerCase()
  let score = 45

  for (const word of ['invest', 'stock', 'portfolio', 'trading', 'market', 'etf']) {
    if (text.includes(word)) score += 8
  }

  for (const word of ['crypto', 'bitcoin', 'ethereum', 'defi']) {
    if (text.includes(word)) score += 7
  }

  if (community.platform === 'facebook' || community.platform === 'reddit') score += 5
  return Math.min(95, score)
}

function inferActivity(community) {
  if (community.activity) return community.activity
  if (community.members >= 1000000) return 88
  if (community.members >= 100000) return 78
  if (community.members >= 10000) return 68
  return 55
}

module.exports = {
  scoreCommunity,
  inferRelevance,
  inferActivity,
}
