const AUTH_STORAGE_KEY = 'w3deploy.github-authenticated'
const AUTH_CHANGE_EVENT = 'w3deploy-auth-change'

export function isAuthenticated() {
  return window.localStorage.getItem(AUTH_STORAGE_KEY) === 'true'
}

function notifyAuthChange() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
}

export function setAuthenticated(value) {
  if (value) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, 'true')
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
