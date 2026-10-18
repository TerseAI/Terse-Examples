import { spawn, type ChildProcess } from "node:child_process"
import { access, readdir, readFile } from "node:fs/promises"
import { createConnection } from "node:net"
import path from "node:path"
import { createInterface } from "node:readline/promises"
import { styleText } from "node:util"

const root = path.resolve(import.meta.dirname, "..")
const actorPort = 7100
const readyTimeoutMs = 60_000

const color = process.stdout.isTTY

type Example = {
    readonly sectionId: string
    readonly sectionLabel: string
    readonly sectionOrder: number
    readonly id: string
    readonly qualifiedId: string
    readonly directory: string
    readonly description: string | undefined
}

type Resolution =
    | { readonly kind: "run"; readonly example: Example }
    | { readonly kind: "section"; readonly examples: readonly Example[] }
    | { readonly kind: "ambiguous"; readonly examples: readonly Example[] }
    | { readonly kind: "missing" }

await main(process.argv.slice(2))

async function main(args: readonly string[]): Promise<void> {
    if (args.length > 1 || args[0] === "--help" || args[0] === "-h") {
        printUsage()
        process.exitCode = args.length > 1 ? 1 : 0
        return
    }

    const examples = await discoverExamples(root)
    if (examples.length === 0) {
        console.error("No examples found. Each example is a section folder containing a project with actor/ and client/.")
        process.exitCode = 1
        return
    }

    const query = args[0]
    if (query === undefined) {
        printCatalog(examples)
        await promptForExample(examples)
        return
    }

    const resolution = resolveExample(examples, query)
    switch (resolution.kind) {
        case "run":
            await runExample(resolution.example)
            return
        case "section":
            printCatalog(resolution.examples)
            return
        case "ambiguous":
            console.error(`More than one example is named ${query}:\n`)
            printCatalog(resolution.examples)
            console.error(`\nName the section too, for example: bun run example ${resolution.examples[0]?.qualifiedId}`)
            process.exitCode = 1
            return
        case "missing":
            console.error(`No example named ${query}.\n`)
            printCatalog(examples)
            process.exitCode = 1
            return
        default:
            throw resolution satisfies never
    }
}

async function promptForExample(examples: readonly Example[]): Promise<void> {
    if (!process.stdin.isTTY) return
    const input = createInterface({ input: process.stdin, output: process.stdout })
    try {
        while (true) {
            const answer = (await input.question("Example: ")).trim()
            if (answer.length === 0) return
            const resolution = resolveExample(examples, answer)
            switch (resolution.kind) {
                case "run":
                    input.close()
                    await runExample(resolution.example)
                    return
                case "section":
                    console.log()
                    printCatalog(resolution.examples)
                    continue
                case "ambiguous":
                    console.error(`\nMore than one example is named ${answer}. Include the section.\n`)
                    printCatalog(resolution.examples)
                    continue
                case "missing":
                    console.error(`\nNo example named ${answer}.\n`)
                    continue
                default:
                    throw resolution satisfies never
            }
        }
    } finally {
        input.close()
    }
}

function printUsage(): void {
    console.log(`Usage:
  bun run example
  bun run example <example>
  bun run example <section>/<example>
  bun run example <section>

With no name, lists every example grouped by section.
A bare example name runs it when that name is unique.`)
}

async function discoverExamples(repoRoot: string): Promise<readonly Example[]> {
    const sections = await directories(repoRoot)
    const found: Example[] = []
    for (const sectionDir of sections) {
        const sectionName = path.basename(sectionDir)
        const numbered = /^(\d+)_(.+)$/u.exec(sectionName)
        const sectionId = numbered?.[2] ?? sectionName
        const sectionOrder = numbered ? Number(numbered[1]) : Number.MAX_SAFE_INTEGER
        const sectionLabel = numbered ? `${numbered[1]}  ${sectionId}` : sectionId
        for (const exampleDir of await directories(sectionDir)) {
            if (!(await isExample(exampleDir))) continue
            const id = path.basename(exampleDir)
            found.push({
                sectionId,
                sectionLabel,
                sectionOrder,
                id,
                qualifiedId: `${sectionId}/${id}`,
                directory: exampleDir,
                description: await readDescription(exampleDir),
            })
        }
    }
    return found.sort((left, right) => {
        if (left.sectionOrder !== right.sectionOrder) return left.sectionOrder - right.sectionOrder
        if (left.sectionId !== right.sectionId) return left.sectionId < right.sectionId ? -1 : 1
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })
}

async function directories(parent: string): Promise<readonly string[]> {
    const entries = await readdir(parent, { withFileTypes: true })
    return entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
        .map(entry => path.join(parent, entry.name))
        .sort((left, right) => (path.basename(left) < path.basename(right) ? -1 : 1))
}

async function isExample(directory: string): Promise<boolean> {
    const [actor, client] = await Promise.all([
        exists(path.join(directory, "actor", "package.json")),
        exists(path.join(directory, "client", "package.json")),
    ])
    return actor && client
}

async function readDescription(exampleDir: string): Promise<string | undefined> {
    for (const relativePath of ["README.md", path.join("actor", "README.md")]) {
        const text = await readFile(path.join(exampleDir, relativePath), "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return undefined
            throw error
        })
        const line = text
            ?.split("\n")
            .map(item => item.trim())
            .find(item => item.length > 0 && !item.startsWith("#"))
        if (line) return line
    }
    return undefined
}

function resolveExample(examples: readonly Example[], query: string): Resolution {
    const normalized = query.replaceAll("\\", "/").replace(/\/+$/u, "")
    const qualified = examples.find(example => example.qualifiedId === normalized || rawQualifiedId(example) === normalized)
    if (qualified) return { kind: "run", example: qualified }

    const byName = examples.filter(example => example.id === normalized)
    const bySection = examples.filter(example => example.sectionId === normalized || path.basename(path.dirname(example.directory)) === normalized)
    if (byName.length === 1 && bySection.length === 0) return { kind: "run", example: byName[0]! }
    if (byName.length > 1) return { kind: "ambiguous", examples: byName }
    if (byName.length === 1 && bySection.length > 0) return { kind: "ambiguous", examples: [byName[0]!, ...bySection] }
    if (bySection.length > 0) return { kind: "section", examples: bySection }
    return { kind: "missing" }
}

function rawQualifiedId(example: Example): string {
    const sectionDir = path.basename(path.dirname(example.directory))
    return `${sectionDir}/${example.id}`
}

function printCatalog(examples: readonly Example[]): void {
    const width = Math.max(...examples.map(example => example.id.length))
    let currentSection = ""
    for (const example of examples) {
        if (example.sectionLabel !== currentSection) {
            if (currentSection.length > 0) console.log()
            currentSection = example.sectionLabel
            console.log(paint(example.sectionLabel, "bold"))
        }
        const description = example.description === undefined ? "" : `   ${paint(example.description, "dim")}`
        console.log(`  ${example.id.padEnd(width)}${description}`)
    }
    const sample = examples[0]
    if (sample === undefined) return
    console.log(`\nRun one with ${paint(`bun run example ${sample.id}`, "cyan")}`)
    console.log(`Include the section when you need to: ${paint(`bun run example ${sample.qualifiedId}`, "cyan")}`)
}

async function runExample(example: Example): Promise<void> {
    if (await portOpen(actorPort)) {
        console.error(
            `Port ${actorPort} is already in use. durable-actors dev uses that port, so only one example can run at a time.`,
        )
        process.exitCode = 1
        return
    }

    const actorDir = path.join(example.directory, "actor")
    const clientDir = path.join(example.directory, "client")
    await ensureInstalled(actorDir)
    await ensureInstalled(clientDir)

    console.log(paint(`Starting ${example.qualifiedId}`, "bold"))
    const children: ChildProcess[] = []
    const stop = bindShutdown(children)
    const actor = start(actorDir, ["node_modules/durable-actors/bin/durable-actors.js", "dev"])
    children.push(actor)

    const ready = await waitForPort(actorPort, actor, readyTimeoutMs)
    if (!ready) {
        await stop("SIGTERM")
        console.error(`Actor server for ${example.qualifiedId} did not open port ${actorPort}.`)
        process.exitCode = 1
        return
    }

    const client = start(clientDir, ["run", "start"])
    children.push(client)
    const clientCode = await exited(client)
    await stop("SIGTERM")
    process.exitCode = clientCode ?? 1
}

function start(cwd: string, args: readonly string[]): ChildProcess {
    const child = spawn("bun", [...args], {
        cwd,
        detached: true,
        // Inherit the terminal so actor and client output stays line-buffered.
        // A pipe would block-buffer the dev server until it exits.
        stdio: ["pipe", "inherit", "inherit"],
    })
    child.on("error", error => {
        console.error(error.message)
    })
    return child
}

function bindShutdown(children: readonly ChildProcess[]): (signal: NodeJS.Signals) => Promise<void> {
    let stopping = false
    const stop = async (signal: NodeJS.Signals): Promise<void> => {
        if (stopping) return
        stopping = true
        for (const child of children) signalGroup(child, signal)
        await Promise.all(children.map(child => exited(child).catch(() => undefined)))
    }
    const onSignal = (signal: NodeJS.Signals) => {
        void stop(signal).finally(() => process.exit(signal === "SIGINT" ? 130 : 143))
    }
    process.once("SIGINT", onSignal)
    process.once("SIGTERM", onSignal)
    return stop
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
    if (child.pid === undefined) return
    try {
        process.kill(-child.pid, signal)
    } catch (error) {
        const code = error instanceof Error && "code" in error ? error.code : undefined
        if (code === "ESRCH") return
        child.kill(signal)
    }
}

async function ensureInstalled(directory: string): Promise<void> {
    if (await exists(path.join(directory, "node_modules"))) return
    console.log(`Installing dependencies in ${path.relative(root, directory)}`)
    const install = spawn("bun", ["install"], { cwd: directory, stdio: "inherit" })
    const code = await exited(install)
    if (code !== 0) throw new Error(`bun install failed in ${directory}`)
}

function waitForPort(port: number, actor: ChildProcess, timeoutMs: number): Promise<boolean> {
    const started = Date.now()
    return new Promise(resolve => {
        const timer = setInterval(() => {
            if (actor.exitCode !== null || actor.signalCode !== null) {
                clearInterval(timer)
                resolve(false)
                return
            }
            if (Date.now() - started > timeoutMs) {
                clearInterval(timer)
                resolve(false)
                return
            }
            void portOpen(port).then(open => {
                if (!open) return
                clearInterval(timer)
                resolve(true)
            })
        }, 200)
    })
}

function portOpen(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const socket = createConnection({ host: "127.0.0.1", port })
        const finish = (open: boolean) => {
            socket.removeAllListeners()
            socket.destroy()
            resolve(open)
        }
        socket.once("connect", () => finish(true))
        socket.once("error", () => finish(false))
    })
}

function exited(child: ChildProcess): Promise<number | null> {
    if (child.exitCode !== null) return Promise.resolve(child.exitCode)
    return new Promise((resolve, reject) => {
        child.once("error", reject)
        child.once("exit", code => resolve(code))
    })
}

async function exists(file: string): Promise<boolean> {
    return access(file).then(
        () => true,
        () => false,
    )
}

function paint(text: string, style: "bold" | "dim" | "cyan"): string {
    return color ? styleText(style, text) : text
}
