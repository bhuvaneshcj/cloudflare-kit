# Contributing to Cloudflare Kit

Thank you for your interest in contributing to Cloudflare Kit! This document provides guidelines and instructions for contributing.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report, please check the existing issues to see if the problem has already been reported.

When creating a bug report, please include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Your environment (Node.js version, Cloudflare Workers runtime version)
- Code samples that demonstrate the issue

### Suggesting Enhancements

Enhancement suggestions are welcome. Please provide:

- A clear use case
- Description of the expected behavior
- Any potential implementation details

### Pull Requests

1. Fork the repository
2. Create a new branch from `main` (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run the test suite (`npm run typecheck`)
5. Commit your changes with a descriptive message
6. Push to your fork
7. Open a Pull Request

## Development Setup

```bash
# Clone the repository
git clone https://github.com/bhuvaneshcj/cloudflare-stack.git
cd cloudflare-kit

# Install dependencies
npm install

# Run type checking
npm run typecheck

# Build the project
npm run build
```

## Code Style

- Use TypeScript for all new code
- Follow the existing code style and formatting
- Use descriptive variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and modular

## Testing

- Ensure `npm run typecheck` passes without errors
- Test your changes in a real Cloudflare Workers environment when possible
- Include example code in documentation for new features

## Commit Message Guidelines

- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters
- Reference issues and pull requests where appropriate

## Release Process

1. Update the version in `package.json`
2. Update `CHANGELOG.md` with the new version
3. Create a git tag (`git tag v1.0.0`)
4. Push the tag (`git push origin v1.0.0`)
5. The CI will publish to npm

## Questions?

Feel free to open an issue for questions or join the discussions.
