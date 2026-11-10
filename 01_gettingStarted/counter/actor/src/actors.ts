// # A simple atomic counter using Durable Actors

import { Actor, Emittable, Persisted, type ActorSocket } from "terse-sdk/actor"

// Define the types of the messages that can be sent to the actor.
export type CounterMessage = { type: "increment" } | { type: "decrement" }

// The actor will prevent multiple clients
export class Counter extends Actor<null, CounterMessage> {
    // Define your value as durable + broadcast the changes to every connected client.
    @Persisted @Emittable value = 0

    async read() {
        return this.value
    }

    async increment() {
        return ++this.value
    }

    async decrement() {
        return --this.value
    }

    async onMessage(_socket: ActorSocket<null, CounterMessage>, message: CounterMessage) {
        if (message.type === "increment") await this.increment()
        else await this.decrement()
    }
}
