# Terse-Examples

A collection of sample projects to help you get started with Durable Actors.

Each example consists of an Actors Project + client directory. You will notice clients can be as simple as a CLI, or a full 3 tier web app.

Every example has the same set-up.

One actor folder (with the actor definition). And one client folder.

You can run any example. by doing:

```
bun run example helloWorld
```

This will run the dev server for the actors, and launch whatever service for the client.

If none provided, it will ask you which one to run.

> Note: Due to the way `terse actor dev` works, you can only run one example at a time.

We hope this serves as great inspiration for you to build some really cool stuff!