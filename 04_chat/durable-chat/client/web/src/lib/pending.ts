/** Holds the first prompt of a new chat until its Conversation connects. */
export function queuePrompt(chatId: string, prompt: Prompt) {
    prompts.set(chatId, prompt)
}

export function takePrompt(chatId: string): Prompt | undefined {
    const prompt = prompts.get(chatId)
    prompts.delete(chatId)
    return prompt
}

const prompts = new Map<string, Prompt>()

type Prompt = { text: string; model: string }
