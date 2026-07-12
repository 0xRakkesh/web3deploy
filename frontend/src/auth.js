const AUTH_STORAGE_KEY = 'w3deploy.github-authenticated'
const AUTH_CHANGE_EVENT = 'w3deploy-auth-change'

export function isAuthenticated() {
  const token = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (token === 'true') {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return false
  }
  return !!token
}

export function getToken() {
  const token = window.localStorage.getItem(AUTH_STORAGE_KEY)
  return token === 'true' ? null : token
}

function notifyAuthChange() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
}

export function setAuthenticated(token) {
  if (token) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, token)
    notifyAuthChange()
    return
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY)
  notifyAuthChange()
}

export function clearAuthentication() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
  notifyAuthChange()
}

export function subscribeAuthChanges(listener) {
  window.addEventListener(AUTH_CHANGE_EVENT, listener)
  window.addEventListener('storage', listener)

  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}
