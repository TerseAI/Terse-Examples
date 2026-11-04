/** Mastra model router IDs. Edit freely; a provider only shows up when its key is set. */
export const MODELS: readonly ModelOption[] = [
    { id: "anthropic/claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic" },
    { id: "anthropic/claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic" },
    { id: "openai/gpt-6.1-terra", label: "GPT-6.1 Terra", provider: "openai" },
    { id: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol", provider: "openai" },
    { id: "google/gemini-4-argon", label: "Gemini 4 Argon", provider: "google" },
    { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "google" },
    { id: "xai/grok-4.7", label: "Grok 4.7", provider: "xai" },
    { id: "xai/grok-4.6", label: "Grok 4.6", provider: "xai" },
]

export function availableModels(): ModelOption[] {
    return MODELS.filter(model => hasKey(model.provider))
}

export function isAvailable(modelId: string): boolean {
    return availableModels().some(model => model.id === modelId)
}

function hasKey(provider: Provider): boolean {
    return PROVIDER_KEYS[provider].some(name => Boolean(env()[name]?.trim()))
}

// The actor declaration build links only imported packages, so ambient Node types (and `process`) are missing there.
function env(): Record<string, string | undefined> {
    return (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
}

const PROVIDER_KEYS: Record<Provider, readonly string[]> = {
    anthropic: ["ANTHROPIC_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    google: ["GEMINI_API_KEY"],
    xai: ["XAI_API_KEY"],
}

export type ModelOption = { id: string; label: string; provider: Provider }

export type Provider = "anthropic" | "openai" | "google" | "xai"
