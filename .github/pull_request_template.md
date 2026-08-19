## What changed

<!-- One or two sentences. Why, not just what. -->

## Verification

- [ ] `pnpm verify` passes
- [ ] Behaviour verified at runtime, not only by reading the code
- [ ] Tests added or updated for the change

<!-- Delete the sections that do not apply. -->

## Security

- [ ] Authorization checked server-side for every resource
- [ ] All new input validated with Zod
- [ ] No secret in code, logs, error output or client bundle
- [ ] Security-relevant actions write an audit entry

## Database

- [ ] Migration reviewed for lock behaviour
- [ ] Indexes justified by an actual query
- [ ] No N+1; `select` limited to needed columns

## Multilingual / UI

- [ ] No hardcoded user-facing text; keys added to all three locale files
- [ ] Logical CSS properties only
- [ ] Verified in `fa-AF` (RTL) at 320px width
- [ ] All locales still statically rendered in the build output

## Bandwidth

- [ ] No unjustified client-bundle growth
- [ ] Images via `next/image`, fonts via `next/font`
