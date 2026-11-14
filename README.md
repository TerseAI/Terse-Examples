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

## Native documentation sync

After `TerseAI/Terse`'s `sync-docs-examples.yml` receiver is merged to `main`,
updates to this repository's `main` (or a manual workflow run on `main`) dispatch
that receiver independently of the existing Vercel deploy hook. No source code
or workflow inputs are sent; the receiver resolves examples from `main` when it
executes.

Before enabling this automation, a repository administrator must provision the
`docs-sync` GitHub Environment in **Terse-Examples** with deployment access limited
to the **branch** `main`, with no allowed tags. Store `TERSE_DOCS_DISPATCH_TOKEN`
only as a secret in that protected environment, not as a repository or
organization secret. Use a separate fine-grained token scoped only to
**TerseAI/Terse**, granting **Actions: write** (plus GitHub's mandatory metadata
read access), not Contents or Pull requests write. Do not reuse the receiver's
`TERSE_DOCS_SYNC_TOKEN`; remove any old repository/organization-level docs tokens
that grant access to these workflows.

The workflow references the environment but cannot configure its protection
rules. An automatically created environment is unprotected: the job's main-only
condition is defense in depth, not a substitute for the environment's branch
policy. Missing dispatch credentials fail the docs job explicitly. Environment
provisioning, token installation, and a live end-to-end dispatch must be verified
before considering the integration operational.
