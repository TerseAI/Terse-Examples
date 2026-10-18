import { Command } from "commander"
import { actors } from "./generated"

await new Command()
    .action(async () => {
        console.log(await actors.Counter.get("counter").increment())
    })
    .parseAsync()
