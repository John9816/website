import { useCallback, useEffect, useRef, useState } from 'react'
import { App as AntApp } from 'antd'
import { createAiConversation, sendAiMessage } from '../api/ai'
import { getMusicHistory, musicSearch } from '../api/music'
import { useAuth } from '../context/AuthContext'
import type { MusicHistoryItem, MusicSourceId, SongSearchItem } from '../types'

const CONVERSATION_TITLE = '音乐推荐助手'
const HISTORY_SIZE = 40
const SEARCH_PLAN_LIMIT = 4
const SEARCH_RESULT_LIMIT = 8
const CANDIDATE_LIMIT = 24
const RECOMMEND_LIMIT = 10

export interface MusicAiSearchPlan {
  source: MusicSourceId
  keyword: string
  reason: string
}

export interface MusicAiRecommendationItem {
  song: SongSearchItem
  reason: string
}

interface PlanResponse {
  summary?: string
  searchPlans?: Array<{
    source?: MusicSourceId
    keyword?: string
    reason?: string
  }>
}

interface RankingResponse {
  summary?: string
  recommendations?: Array<{
    source?: MusicSourceId
    id?: string
    reason?: string
  }>
}

function isMusicSourceId(value: unknown): value is MusicSourceId {
  return value === 'qq' || value === 'netease' || value === 'kuwo'
}

function sourceLabel(source: MusicSourceId) {
  switch (source) {
    case 'qq':
      return 'QQ 音乐'
    case 'netease':
      return '网易云'
    case 'kuwo':
      return '酷我'
  }
}

function songKey(song: Pick<SongSearchItem, 'source' | 'id'>) {
  return `${song.source}:${song.id}`
}

function historySongIdentity(item: Pick<MusicHistoryItem, 'name' | 'artist'>) {
  return `${item.name.trim().toLowerCase()}::${(item.artist ?? '').trim().toLowerCase()}`
}

function candidateIdentity(item: Pick<SongSearchItem, 'name' | 'artist'>) {
  return `${item.name.trim().toLowerCase()}::${item.artist.trim().toLowerCase()}`
}

function trimText(value: unknown, max = 60) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function parseJsonObject<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced?.[1] ?? text).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  const payload = start >= 0 && end > start ? raw.slice(start, end + 1) : raw
  return JSON.parse(payload) as T
}

function countTopValues(values: string[], limit: number) {
  const counter = new Map<string, number>()
  values.forEach((value) => {
    const normalized = value.trim()
    if (!normalized) return
    counter.set(normalized, (counter.get(normalized) ?? 0) + 1)
  })
  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([value, count]) => `${value}(${count})`)
}

function buildHistoryDigest(history: MusicHistoryItem[]) {
  const recent = history
    .slice(0, 20)
    .map((item, index) => {
      const parts = [
        `${index + 1}. ${item.name}`,
        item.artist ? `歌手:${item.artist}` : '',
        item.album ? `专辑:${item.album}` : '',
        `来源:${sourceLabel(item.source)}`,
      ].filter(Boolean)
      return parts.join(' | ')
    })
    .join('\n')

  const topArtists = countTopValues(history.map((item) => item.artist ?? ''), 5).join('、') || '无'
  const topAlbums = countTopValues(history.map((item) => item.album ?? ''), 4).join('、') || '无'

  return {
    recent,
    topArtists,
    topAlbums,
  }
}

function buildPlanPrompt(history: MusicHistoryItem[], preference: string) {
  const digest = buildHistoryDigest(history)
  return [
    '你是音乐推荐规划助手。',
    '任务：根据用户最近播放历史，先设计接下来要执行的站内音乐搜索计划。',
    '只返回 JSON，不要 Markdown，不要解释。',
    'JSON 格式：{"summary":"一句话总结口味","searchPlans":[{"source":"qq|netease|kuwo","keyword":"搜索关键词","reason":"为什么搜这个"}]}',
    '要求：',
    '1. searchPlans 返回 3 到 4 条。',
    '2. keyword 必须是适合音乐站内搜索的短关键词，不要长句，不超过 12 个汉字。',
    '3. 优先覆盖不同歌手、风格、时期或场景。',
    '4. 不要直接重复用户最近播放历史里的完全相同歌曲。',
    `5. 用户额外偏好：${preference.trim() || '无'}`,
    `高频歌手：${digest.topArtists}`,
    `高频专辑：${digest.topAlbums}`,
    '最近播放历史：',
    digest.recent,
  ].join('\n')
}

function buildRankingPrompt(
  history: MusicHistoryItem[],
  preference: string,
  planSummary: string,
  candidates: SongSearchItem[],
) {
  const digest = buildHistoryDigest(history)
  const candidateLines = candidates
    .map((song, index) => {
      const parts = [
        `${index + 1}. [${song.source}:${song.id}] ${song.name}`,
        song.artist ? `歌手:${song.artist}` : '',
        song.album ? `专辑:${song.album}` : '',
      ].filter(Boolean)
      return parts.join(' | ')
    })
    .join('\n')

  return [
    '你是音乐推荐助手。',
    '任务：从候选歌曲里挑出最适合当前用户的推荐结果。',
    '只返回 JSON，不要 Markdown，不要解释。',
    'JSON 格式：{"summary":"2到3句中文总结","recommendations":[{"source":"qq|netease|kuwo","id":"候选歌曲ID","reason":"推荐理由"}]}',
    '要求：',
    `1. recommendations 返回 6 到 ${RECOMMEND_LIMIT} 首。`,
    '2. 只能从给定候选歌曲里选择，source 和 id 必须原样抄写。',
    '3. 优先保证多样性，避免同一歌手连续堆积。',
    '4. 不要挑选与最近播放历史完全相同的歌名 + 歌手组合。',
    '5. 推荐理由控制在 30 个汉字内，要具体，不要空话。',
    `用户额外偏好：${preference.trim() || '无'}`,
    `播放画像：${planSummary || `${digest.topArtists}，偏向这些歌手相关的听感`}`,
    `高频歌手：${digest.topArtists}`,
    '候选歌曲：',
    candidateLines,
  ].join('\n')
}

function buildFallbackPlans(history: MusicHistoryItem[]) {
  const seen = new Set<string>()
  const plans: MusicAiSearchPlan[] = []

  history.forEach((item) => {
    if (plans.length >= SEARCH_PLAN_LIMIT) return

    const keyword = trimText(item.artist || item.name, 12)
    if (!keyword) return

    const key = `${item.source}:${keyword.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)

    plans.push({
      source: item.source,
      keyword,
      reason: item.artist ? `延展 ${item.artist} 相关歌曲` : `延展 ${item.name} 相近结果`,
    })
  })

  return plans
}

function buildFallbackSummary(history: MusicHistoryItem[], preference: string) {
  const digest = buildHistoryDigest(history)
  const hasArtists = digest.topArtists && digest.topArtists !== '无'
  const preferenceText = trimText(preference, 24)

  return [
    'AI 服务暂时不可用，已切换为基于播放历史的推荐。',
    hasArtists ? `最近常听：${digest.topArtists}。` : '已优先参考你最近播放过的歌曲。',
    preferenceText ? `额外偏好：${preferenceText}。` : '已优先延展相近歌手和听感。',
  ].join('')
}

function sanitizePlans(input: PlanResponse | null, history: MusicHistoryItem[]) {
  const seen = new Set<string>()
  const plans: MusicAiSearchPlan[] = []

  input?.searchPlans?.forEach((plan) => {
    if (plans.length >= SEARCH_PLAN_LIMIT) return

    const source = isMusicSourceId(plan.source) ? plan.source : 'qq'
    const keyword = trimText(plan.keyword, 20)
    if (!keyword) return

    const key = `${source}:${keyword.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)

    plans.push({
      source,
      keyword,
      reason: trimText(plan.reason, 36) || `搜索 ${keyword}`,
    })
  })

  if (plans.length) return plans
  return buildFallbackPlans(history)
}

function dedupeCandidates(
  items: SongSearchItem[],
  history: MusicHistoryItem[],
  planHints: Map<string, string>,
) {
  const seenKeys = new Set<string>()
  const seenIdentities = new Set<string>()
  const historyIdentities = new Set(history.map(historySongIdentity))
  const nextItems: SongSearchItem[] = []
  const nextHints = new Map<string, string>()

  items.forEach((item) => {
    if (nextItems.length >= CANDIDATE_LIMIT) return

    const key = songKey(item)
    const identity = candidateIdentity(item)
    if (seenKeys.has(key) || seenIdentities.has(identity) || historyIdentities.has(identity)) {
      return
    }

    seenKeys.add(key)
    seenIdentities.add(identity)
    nextItems.push(item)

    const hint = planHints.get(key)
    if (hint) nextHints.set(key, hint)
  })

  return {
    items: nextItems,
    hints: nextHints,
  }
}

function mergeRecommendations(
  input: RankingResponse | null,
  candidates: SongSearchItem[],
  candidateHints: Map<string, string>,
) {
  const byKey = new Map(candidates.map((song) => [songKey(song), song] as const))
  const used = new Set<string>()
  const items: MusicAiRecommendationItem[] = []

  input?.recommendations?.forEach((item) => {
    if (items.length >= RECOMMEND_LIMIT) return
    if (!isMusicSourceId(item.source) || !item.id) return

    const key = `${item.source}:${item.id}`
    if (used.has(key)) return

    const song = byKey.get(key)
    if (!song) return

    used.add(key)
    items.push({
      song,
      reason: trimText(item.reason, 48) || candidateHints.get(key) || '这首歌和你的近期听感相近',
    })
  })

  if (items.length) return items

  return candidates.slice(0, RECOMMEND_LIMIT).map((song) => ({
    song,
    reason: candidateHints.get(songKey(song)) || '这首歌与最近播放的风格接近，适合继续听下去',
  }))
}

async function createRecommendationConversation() {
  const conversation = await createAiConversation({ title: CONVERSATION_TITLE })
  return conversation.id
}

async function sendRecommendationMessage(conversationId: number, prompt: string) {
  return sendAiMessage(conversationId, { content: prompt })
}

export function useMusicAiRecommendations() {
  const { message } = AntApp.useApp()
  const auth = useAuth()
  const [historyItems, setHistoryItems] = useState<MusicHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState('')
  const [summary, setSummary] = useState('')
  const [searchPlans, setSearchPlans] = useState<MusicAiSearchPlan[]>([])
  const [recommendations, setRecommendations] = useState<MusicAiRecommendationItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const historyRequestIdRef = useRef(0)
  const runRequestIdRef = useRef(0)

  const loadHistory = useCallback(async () => {
    if (!auth.token) {
      setHistoryItems([])
      return []
    }

    const requestId = ++historyRequestIdRef.current
    setHistoryLoading(true)
    try {
      const data = await getMusicHistory(0, HISTORY_SIZE)
      if (requestId !== historyRequestIdRef.current) return []
      setHistoryItems(data.items)
      return data.items
    } catch (nextError) {
      if (requestId !== historyRequestIdRef.current) return []
      const nextMessage = (nextError as Error).message
      setError(nextMessage)
      message.error(nextMessage)
      return []
    } finally {
      if (requestId === historyRequestIdRef.current) {
        setHistoryLoading(false)
      }
    }
  }, [auth.token, message])

  const generateRecommendations = useCallback(
    async (preference = '') => {
      if (!auth.token) {
        setError('登录后才能使用 AI 推荐')
        return
      }

      const requestId = ++runRequestIdRef.current
      setLoading(true)
      setError(null)
      setPhase('分析最近播放历史')

      try {
        const history = historyItems.length ? historyItems : await loadHistory()
        if (requestId !== runRequestIdRef.current) return

        if (!history.length) {
          setSummary('')
          setSearchPlans([])
          setRecommendations([])
          setError('还没有可用的播放历史，先播放几首歌再来生成推荐')
          return
        }

        let fallbackMode = false
        let planData: PlanResponse | null = null
        let rankingData: RankingResponse | null = null
        let nextPlans: MusicAiSearchPlan[] = []

        try {
          const conversationId = await createRecommendationConversation()
          const planReply = await sendRecommendationMessage(
            conversationId,
            buildPlanPrompt(history, preference),
          )
          if (requestId !== runRequestIdRef.current) return

          planData = parseJsonObject<PlanResponse>(planReply.assistantMessage.content)
          nextPlans = sanitizePlans(planData, history)

          if (!nextPlans.length) {
            nextPlans = buildFallbackPlans(history)
            fallbackMode = true
          }

          setSearchPlans(nextPlans)

          setPhase('搜索候选歌曲')
          const settled = await Promise.allSettled(
            nextPlans.map(async (plan) => {
              const result = await musicSearch(plan.source, plan.keyword, 1, SEARCH_RESULT_LIMIT)
              return {
                plan,
                list: result.list,
              }
            }),
          )
          if (requestId !== runRequestIdRef.current) return

          const candidateHints = new Map<string, string>()
          const rawCandidates: SongSearchItem[] = []
          settled.forEach((result) => {
            if (result.status !== 'fulfilled') return
            result.value.list.forEach((song) => {
              rawCandidates.push(song)
              const key = songKey(song)
              if (!candidateHints.has(key)) {
                candidateHints.set(key, result.value.plan.reason)
              }
            })
          })

          const deduped = dedupeCandidates(rawCandidates, history, candidateHints)
          if (!deduped.items.length) {
            setSummary(planData?.summary?.trim() || '')
            setRecommendations([])
            setError('没有搜索到适合推荐的候选歌曲，可以稍后再试一次')
            return
          }

          if (!fallbackMode) {
            try {
              setPhase('整理推荐结果')
              const rankingReply = await sendRecommendationMessage(
                conversationId,
                buildRankingPrompt(history, preference, planData?.summary?.trim() || '', deduped.items),
              )
              if (requestId !== runRequestIdRef.current) return

              rankingData = parseJsonObject<RankingResponse>(rankingReply.assistantMessage.content)
            } catch {
              fallbackMode = true
            }
          }

          const nextRecommendations = mergeRecommendations(rankingData, deduped.items, deduped.hints)
          setRecommendations(nextRecommendations)

          if (fallbackMode) {
            setError(null)
            setSummary(buildFallbackSummary(history, preference))
            message.warning('AI 对话服务暂时不可用，已切换为基于播放历史的推荐')
            return
          }

          setSummary(
            trimText(rankingData?.summary, 160) ||
              trimText(planData?.summary, 120) ||
              '根据你最近常听的歌曲，整理了一组更适合继续接着听的推荐。',
          )
          return
        } catch {
          const nextPlansFromHistory = buildFallbackPlans(history)
          setSearchPlans(nextPlansFromHistory)

          if (!nextPlansFromHistory.length) {
            setSummary('')
            setRecommendations([])
            setError('AI 暂时不可用，且无法从播放历史生成推荐计划')
            return
          }

          setPhase('搜索候选歌曲')
          const settled = await Promise.allSettled(
            nextPlansFromHistory.map(async (plan) => {
              const result = await musicSearch(plan.source, plan.keyword, 1, SEARCH_RESULT_LIMIT)
              return {
                plan,
                list: result.list,
              }
            }),
          )
          if (requestId !== runRequestIdRef.current) return

          const candidateHints = new Map<string, string>()
          const rawCandidates: SongSearchItem[] = []
          settled.forEach((result) => {
            if (result.status !== 'fulfilled') return
            result.value.list.forEach((song) => {
              rawCandidates.push(song)
              const key = songKey(song)
              if (!candidateHints.has(key)) {
                candidateHints.set(key, result.value.plan.reason)
              }
            })
          })

          const deduped = dedupeCandidates(rawCandidates, history, candidateHints)
          if (!deduped.items.length) {
            setSummary('')
            setRecommendations([])
            setError('AI 暂时不可用，且没有搜索到可回退的推荐歌曲')
            return
          }

          setRecommendations(mergeRecommendations(null, deduped.items, deduped.hints))
          setError(null)
          setSummary(buildFallbackSummary(history, preference))
          message.warning('AI 对话服务暂时不可用，已切换为基于播放历史的推荐')
          return
        }
      } catch (nextError) {
        if (requestId !== runRequestIdRef.current) return
        const nextMessage = (nextError as Error).message
        setError(nextMessage)
        message.error(nextMessage)
      } finally {
        if (requestId === runRequestIdRef.current) {
          setLoading(false)
          setPhase('')
        }
      }
    },
    [auth.token, historyItems, loadHistory, message],
  )

  useEffect(() => {
    if (auth.token) return
    setHistoryItems([])
    setSummary('')
    setSearchPlans([])
    setRecommendations([])
    setError(null)
  }, [auth.token])

  return {
    historyItems,
    historyLoading,
    loading,
    phase,
    summary,
    searchPlans,
    recommendations,
    error,
    loadHistory,
    generateRecommendations,
  }
}
