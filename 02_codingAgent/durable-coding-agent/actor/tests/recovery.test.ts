import { describe, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createModels, fauxProvider, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { createRegistry, type ConversationView } from "@earendil-works/pi-durable";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { ActorDatabase } from "durable-actors";

import { PiAgent } from "../src/actor";
import { DurablePiAgent } from "../src/pi/DurablePiAgent";

function scenario() {
    const sqlite = new Database(":memory:");
    const db: ActorDatabase = {
        exec: (sql, ...bindings) => sqlite.query(sql).all(...bindings) as any,
        transaction: async operation => operation(),
    };
    let alarm: number | null = null;
    const alarms = {
        get: () => alarm,
        set: (timestamp: number) => { alarm = timestamp; },
        delete: () => { alarm = null; },
    };
    const agents: DurablePiAgent[] = [];
    function create(paused = true) {
        const finish = Promise.withResolvers<void>();
        const faux = fauxProvider();
        const models = createModels();
        models.setProvider(faux.provider);
        faux.setResponses([async (_context, options) => {
            if (paused) {
                await Promise.race([
                    finish.promise,
                    new Promise<never>((_, reject) => {
                        const abort = () => reject(new Error("Model interrupted"));
                        if (options?.signal?.aborted) abort();
                        else options?.signal?.addEventListener("abort", abort, { once: true });
                    }),
                ]);
            }
            return fauxAssistantMessage("Finished after submission returned");
        }]);
        const agent = new DurablePiAgent(db, {
            models,
            registry: createRegistry(),
            agent: { model: { provider: "faux", modelId: "faux-1" } },
        }, alarms);
        agents.push(agent);
        return { agent, finish: () => finish.resolve(), calls: () => faux.state.callCount };
    }
    return {
        create, alarms,
        close: async () => {
            for (const agent of agents) await agent.onGracefulShutdown();
            sqlite.close();
        },
    };
}

async function eventually(check: () => boolean) {
    const deadline = Date.now() + 2000;
    while (!check()) {
        if (Date.now() >= deadline) throw new Error("Timed out waiting for the harness");
        await Bun.sleep(5);
    }
}

describe("pi-durable owns streaming and recovery", () => {
    test("submission returns while work continues, and the connection watch streams the answer", async () => {
        const run = scenario();
        const { agent, finish, calls } = run.create();
        const views: ConversationView[] = [];
        try {
            await agent.onResume();
            expect(run.alarms.get()).toBeNull();
            await agent.watch(async view => { views.push(view); });
            // Another connection shares the existing broadcaster instead of doubling the stream.
            await agent.watch(async () => { throw new Error("Duplicate watcher"); });
            await agent.prompt("Keep working");
            await eventually(() => calls() > 0 && run.alarms.get() !== null);
            expect((await agent.harness.inspect(context)).tasks.length).toBeGreaterThan(0);
            const before = views.length;
            await agent.onAlarm();
            expect(run.alarms.get()).not.toBeNull();
            finish();
            await agent.harness.waitForIdle(context);
            await eventually(() => run.alarms.get() === null && views.length > before);
            expect(JSON.stringify(views.at(-1))).toContain("Finished after submission returned");
            await agent.onAlarm();
            expect(run.alarms.get()).toBeNull();
        } finally { await run.close(); }
    });

    test("reopening persisted unfinished work resumes it without resubmitting the prompt", async () => {
        const run = scenario();
        const first = run.create();
        try {
            await first.agent.onResume();
            await first.agent.prompt("Survive the restart");
            await eventually(() => first.calls() > 0 && run.alarms.get() !== null);
            await first.agent.onGracefulShutdown();
            expect(run.alarms.get()).not.toBeNull();
            const second = run.create(false);
            await second.agent.onResume();
            await second.agent.onAlarm();
            await second.agent.harness.waitForIdle(context);
            await eventually(() => run.alarms.get() === null);
            const watch = await second.agent.root.watch(context);
            expect(watch.value.entries.filter(entry => entry.kind === "pi.user")).toHaveLength(1);
            expect(JSON.stringify(watch.value)).toContain("Finished after submission returned");
            await watch.stop();
        } finally { await run.close(); }
    });

    test("a temporary output delivery failure does not stop subsequent streamed frames", async () => {
        const run = scenario();
        const { agent, finish } = run.create();
        const errors = spyOn(console, "error").mockImplementation(() => {});
        let deliveries = 0;
        try {
            await agent.onResume();
            await agent.watch(async () => {
                if (++deliveries === 1) throw new Error("Socket temporarily unavailable");
            });
            await agent.prompt("Stream an answer");
            await eventually(() => deliveries > 0);
            finish();
            await agent.harness.waitForIdle(context);
            await eventually(() => deliveries > 1);
            expect(errors).toHaveBeenCalled();
        } finally {
            errors.mockRestore();
            await run.close();
        }
    });

    test("the crash hook has no scheduling or cleanup side effects", async () => {
        const exit = spyOn(process, "exit").mockImplementation(() => { throw new Error("Simulated crash"); });
        try {
            await expect(PiAgent.prototype.crashTheSucker.call({} as PiAgent)).rejects.toThrow("Simulated crash");
            expect(exit).toHaveBeenCalledWith(1);
        } finally { exit.mockRestore(); }
    });
});
