# Playwright AES-Argon2 Encryption Enhancement

## Overview

This repository provides a robust encryption-enhanced testing setup using **Playwright**, **TypeScript**, **AES-GCM**, and **Argon2**. It enables secure management of credentials during test automation.

---

## Getting Started

Ensure **Node.js** is installed. Then, install project dependencies:

```bash
npm install
```

---

## Environment Setup

Before running any tests, configure the environment and encryption variables.

### 1. Configure Environment Variables

Copy the sample environment configuration:

```bash
cp envs/.env.dev.example envs/.env.dev
```

Then, update the newly created `.env.dev` file with your credentials:

```env
PORTAL_USERNAME=your.username
PORTAL_PASSWORD=your.password
```

> ℹ️ The root `.env` file is managed automatically—**do not modify it manually**.

---

## Encryption Workflows

All sensitive data is encrypted using **AES-GCM** and secured with **Argon2** hashing.

### Encryption Commands

#### 1. Generate Secret Key

Run this first to create a secure encryption key:

```bash
npx cross-env PLAYWRIGHT_GREP=@generate-key npm run test:encryption:dev
```

#### 2. Encrypt Credentials

After generating the key, encrypt your `.env` credentials:

```bash
npx cross-env PLAYWRIGHT_GREP=@encrypt npm run test:encryption:dev
```

> 💡 Replace `dev` with your environment: `uat`, `prod`, etc. Ensure a `.env.<env>` file exists.

#### 3. Decrypt Credentials

To access encrypted credentials during test execution:

```bash
npx cross-env PLAYWRIGHT_GREP=@decrypt npm run test:encryption:dev
```

> 💡 Again, replace `dev` with your target environment as needed.

---

## Command Line Utilities

Enhance development productivity and maintain code quality with the following tools:

| Command                   | Description                                   |
| ------------------------- | --------------------------------------------- |
| `npm run ui`              | Launch the Playwright Test Runner UI          |
| `npm run record`          | Start the Playwright Code Generator           |
| `npm run report`          | View the HTML report from the last test run   |
| `npm run format`          | Format code using Prettier                    |
| `npm run format:check`    | Check formatting without making changes       |
| `npm run type:check`      | Run TypeScript checks without emitting files  |
| `npm run lint`            | Lint all `.ts` and `.js` files                |
| `npm run lint:fix`        | Auto-fix linting issues                       |
| `npm run spell`           | Spellcheck source and markdown files          |
| `npm run test:failed:dev` | Re-run only failed tests in `dev` environment |
| `npm run test:failed:uat` | Re-run only failed tests in `uat` environment |

---

## Best Practices & Notes

- ❌ **Never commit `.env` files** to version control.
- 🔄 **Regenerate encryption keys** whenever credentials change.
- 📦 Always run `npm install` after switching branches or pulling updates.
- 🔐 Reuse authentication state to improve performance and test reliability.
- 🔒 Secrets are securely managed using encrypted storage.
- ✅ Fully CI-compatible and built for scalable test automation.

---

## Contributing

**Contributions are welcome!**
Help improve this project by submitting issues, feature requests, or pull requests.

> TODO: Add specific contribution guidelines or a `CONTRIBUTING.md` file.

---

## Further Reading

If you'd like to learn more about crafting great README files, check out the following resources:

- [Creating README files (Microsoft Docs)](https://docs.microsoft.com/en-us/azure/devops/repos/git/create-a-readme?view=azure-devops)
- [ASP.NET Core README](https://github.com/aspnet/Home)
- [Visual Studio Code README](https://github.com/Microsoft/vscode)
- [ChakraCore README](https://github.com/Microsoft/ChakraCore)

---
