import { Command } from "commander"
import { HelloWorld } from "../actor/src/actors.ts"

await new Command()
    .action(async () => {
        const socket = await HelloWorld.get("hello").connect(null)
        socket.addEventListener("message", event => {
            console.log(event.data)
        })
    })
    .parseAsync()
