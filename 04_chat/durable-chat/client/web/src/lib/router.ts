export function navigate(path: string) {
    if (location.pathname === path) return
    history.pushState(null, "", path)
    dispatchEvent(new PopStateEvent("popstate"))
}

export const chatPath = (chatId: string) => `/c/${chatId}`
