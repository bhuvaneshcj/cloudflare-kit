# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within Cloudflare Kit, please send an email to [cjbhuvanesh8@gmail.com](mailto:cjbhuvanesh8@gmail.com). All security vulnerabilities will be promptly addressed.

Please include the following information in your report:

- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability

## Security Best Practices

When using Cloudflare Kit in production:

### Authentication

- Store JWT secrets in environment variables (e.g., `env.JWT_SECRET`)
- Use strong, random secrets (minimum 256 bits)
- Set appropriate token expiration times
- Consider using session-based auth for sensitive applications

### Database

- The library validates SQL identifiers to prevent injection
- Always use parameterized queries via the database methods
- Validate user input before passing to database operations

### Rate Limiting

- The built-in rate limiter uses in-memory storage
- For production with multiple Worker instances, consider implementing distributed rate limiting using KV
- Set appropriate limits based on your use case

### CORS

- Configure CORS with specific origins in production (avoid `*`)
- Use `credentials: true` only when necessary
- Specify allowed headers explicitly

### Environment Variables

- Never commit secrets to version control
- Use Cloudflare's secret management for production
- Validate environment variables at startup

## Security Features

This library implements the following security measures:

- SQL identifier validation to prevent injection attacks
- Base64url encoding for JWT tokens per RFC 7519
- Input validation middleware for request bodies
- Rate limiting middleware

## Disclosure Policy

When we receive a security bug report, we will:

1. Confirm the issue and determine its severity
2. Prepare a fix and test it
3. Release a patched version as soon as possible
4. Publicly disclose the issue after the fix is released

We appreciate your efforts to responsibly disclose your findings and will make every effort to acknowledge your contributions.
