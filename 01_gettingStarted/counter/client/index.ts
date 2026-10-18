import { Command } from "commander"
import { Counter } from "../actor/src/actors.ts"

await new Command()
    .action(async () => {
        console.log(await Counter.get("counter").increment())
    })
    .parseAsync()
