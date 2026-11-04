import { useState } from "react"

import { Conversation } from "./components/Conversation"
import { NewChat } from "./components/NewChat"
import { Sidebar } from "./components/Sidebar"
import { useChatIndex } from "./hooks/useChatIndex"
import { useChatRoute } from "./hooks/useChatRoute"
import { useModels, usePreferredModel } from "./hooks/useModels"
import { useNewChatShortcut } from "./hooks/useNewChatShortcut"
import { useSidebarWidth } from "./hooks/useSidebarWidth"
import { api } from "./lib/api"
import { pickModel } from "./lib/models"
import { queuePrompt } from "./lib/pending"
import { chatPath, navigate } from "./lib/router"

export function App() {
    const chatId = useChatRoute()
    const { chats, status } = useChatIndex()
    const models = useModels()
    const [preferred, setPreferred] = usePreferredModel()
    const [notice, setNotice] = useState<string | null>(null)
    const sidebar = useSidebarWidth()
    useNewChatShortcut()

    const model = pickModel(models, preferred)
    const start = async (text: string) => {
        if (!model) return
        try {
            const { id } = await api.createChat(model.id)
            queuePrompt(id, { text, model: model.id })
            navigate(chatPath(id))
        } catch (error) {
            setNotice(`Couldn't start a chat: ${(error as Error).message}`)
        }
    }

    return (
        <div className="app" style={{ gridTemplateColumns: `${sidebar.width}px minmax(0, 1fr)` }}>
            <Sidebar
                chats={chats}
                activeId={chatId}
                status={status}
                resize={sidebar}
                onNew={() => navigate("/")}
                onOpen={id => navigate(chatPath(id))}
                onRename={(id, title) => void api.updateChat(id, { title }).catch(console.error)}
            />
            <main className="main">
                {chatId ? (
                    <Conversation
                        key={chatId}
                        chatId={chatId}
                        summary={chats.find(chat => chat.id === chatId)}
                        models={models}
                        preferred={preferred}
                        onPreferred={setPreferred}
                    />
                ) : (
                    <NewChat
                        models={models}
                        model={model}
                        onModel={setPreferred}
                        notice={notice}
                        onStart={start}
                    />
                )}
            </main>
        </div>
    )
}
