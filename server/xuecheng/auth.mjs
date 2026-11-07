export async function authenticate(req, backendUrl) {
  const authorization = req.headers.authorization || ''
  if (!/^Bearer [^\s]+$/i.test(authorization) || authorization.length > 8192) {
    throw Object.assign(new Error('请先登录'), { status: 401 })
  }
  if (!backendUrl) throw Object.assign(new Error('登录服务未配置'), { status: 503 })
  let response
  try {
    const url = new URL(backendUrl)
    url.pathname = url.pathname.replace(/\/$/, '') + '/api/user/me'
    url.search = ''
    response = await fetch(url, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(5000), redirect: 'error' })
  } catch {
    throw Object.assign(new Error('暂时无法验证登录状态，请稍后重试'), { status: 503 })
  }
  if (response.status === 401 || response.status === 403) throw Object.assign(new Error('登录已过期，请重新登录'), { status: 401 })
  if (!response.ok) throw Object.assign(new Error('登录服务暂不可用'), { status: 503 })
  const json = await response.json()
  const user = json.data
  if (json.code !== 0 || !user || user.enabled !== true || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw Object.assign(new Error('登录状态无效'), { status: 401 })
  }
  return user
}
