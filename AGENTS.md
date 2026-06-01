# AGENTS.md

## Decision Priority
1. Correctness
2. Security
3. Maintainability
4. Observability
5. Performance
6. Developer convenience

## Objective

Make the smallest safe change that solves the requested problem.

## Core Principles

* Preserve existing architecture and conventions.
* Prefer simple solutions over clever ones.
* Avoid unnecessary dependencies, abstractions, and refactors.
* Keep changes scoped to the task.
* Do not modify unrelated code.

## Code Quality

* Write readable, maintainable code.
* Use meaningful names.
* Keep functions focused and reasonably small.
* Add comments only when intent is not obvious.
* Remove dead code when encountered.

## Logging

* Use structured, traceable logging.
* Include request IDs, entity IDs, operation names, and error context where applicable.
* Never log secrets, credentials, tokens, or personal data.
* Log important state transitions, failures, retries, and external service interactions.
* Prefer machine-parsable logs over free-form text.

## Error Handling

* Fail explicitly with actionable messages.
* Handle expected edge cases.
* Avoid silent failures and swallowed exceptions.
* Preserve useful debugging context.

## Testing

* Add or update tests for behavior changes.
* Verify existing tests continue to pass.
* Prefer focused tests over excessive coverage.

## Security

* Validate all external inputs.
* Follow least-privilege principles.
* Never hardcode secrets.
* Treat user-provided data as untrusted.

## Performance

* Avoid unnecessary allocations, queries, network calls, and loops.
* Optimize only when there is measurable benefit.
* Prioritize correctness before optimization.

## Documentation

* Update relevant documentation when behavior changes.
* Keep docs concise and accurate.

## Git

* Make atomic, reviewable changes.
* Use clear commit messages.
* Do not rewrite history unless explicitly requested.

## When Unsure

* Inspect surrounding code before implementing.
* Follow existing project patterns.
* Choose the least disruptive solution.

## Decision Priority
1. Correctness
2. Security
3. Maintainability
4. Observability
5. Performance
6. Developer convenience