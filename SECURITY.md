# Security Policy

## Supported Versions

Security fixes are provided only for the latest released version of RSSMonster.

Users are encouraged to always upgrade to the newest release.

| Version | Supported |
|----------|-----------|
| Latest release | ✅ |
| Older releases | ❌ |

---

## Reporting a Vulnerability

If you discover a security vulnerability, please do **not** open a public GitHub issue.

Instead, report it privately by emailing:

**<your-email>**

Please include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Proof-of-concept (if available)
- RSSMonster version
- Deployment method (Docker, manual install, etc.)

I will acknowledge receipt as soon as possible and work on a fix.

---

## Responsible Disclosure

Please allow reasonable time to investigate and release a fix before publicly disclosing the vulnerability.

After a fix has been released, coordinated public disclosure is welcomed.

---

## Scope

Security issues include, but are not limited to:

- Authentication bypass
- Authorization issues
- Privilege escalation
- Remote code execution (RCE)
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- SQL injection
- Command injection
- Path traversal
- Sensitive information disclosure
- Server-side request forgery (SSRF)
- Container escape
- Dependency vulnerabilities with practical impact

---

## Out of Scope

The following are generally considered out of scope:

- Vulnerabilities requiring physical access
- Missing security headers without exploitability
- Denial-of-service requiring unrealistic resources
- Version disclosure
- Best-practice recommendations without a demonstrable security impact
- Vulnerabilities only affecting unsupported versions

---

## Security Practices

RSSMonster includes several security measures, including:

- Password hashing
- Input validation
- HTML sanitization before rendering article content
- Safe handling of untrusted RSS/Atom feeds
- Docker support for isolated deployments
- Regular dependency updates

Users are encouraged to:

- Keep RSSMonster up to date
- Keep Docker images updated
- Use HTTPS
- Restrict public access where appropriate
- Run behind a reverse proxy
- Keep backups of the database

---

Thank you for helping improve the security of RSSMonster.
