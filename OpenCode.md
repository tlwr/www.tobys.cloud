# OpenCode Guidelines

## Build, Lint, Test Commands
- **Build**: Use `bazel build //...` to build the project.
- **Lint**: Run `bazel run //:lint` to lint the codebase.
- **Test**: Execute tests using `bazel test //...`.
- **Single Test**: To run a specific test, use `bazel test //path/to:target_test --test_arg=--gtest_filter=TestName.TestCase`.

## Code Style Guidelines
- **Imports**: Group imports logically; standard libraries should be imported first, followed by third-party libraries, and then local packages.
- **Formatting**: Use `gofmt` for Go files and appropriate formatters for other languages in the repo.
- **Types**: Prefer explicit types for function parameters and return values to enhance readability.
- **Naming Conventions**: Use camelCase for variables and functions; constants should be in ALL_CAPS.
- **Error Handling**: Always check for errors. Use `if err != nil { ... }` pattern, and return errors when appropriate.

## Cursor and Copilot Rules
- No specific Cursor or Copilot instructions found in the repository.