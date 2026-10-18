// # Hello, world!

// This is the simplest example of an actor.
    
// Import the actor types, then define you actor.

import { Actor, ActorSocket, Persisted } from "durable-actors"

export class HelloWorld extends Actor<null, null, string> {
    async onConnect(socket: ActorSocket<null, string>): Promise<void> {
        console.log("Client connected, about to tell them hello")
        await socket.send("Hello, world!")
    }
}

// Here is what the actor does
// * You define the websocket metadata type as null (indicating you don't expect any metadata)
// * You define the websocket incoming messages type as null (indicating you don't expect any messages)
// * You define the websocket outgoing messages type as string (indicating you will send strings)
// * Every time a client connects via websocket, it sends a "Hello, world!" message.

// That's it!