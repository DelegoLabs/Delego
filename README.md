# Delego Frontend

<div align="center">

**AI-Powered Delegated Commerce on Stellar — Consumer Web Application**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban-blue)](https://soroban.stellar.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)

</div>

## 🌟 Overview

This repository contains the **Delego consumer web application** (`@delegolabs/web`) and the shared React UI component library (`@delegolabs/ui`). It lets users delegate shopping and payment tasks to AI agents while maintaining approval and spending controls on Stellar.

The backend microservices and Soroban smart contracts live in separate repositories:

- **Backend services**: [DelegoLabs/Delego-backend](https://github.com/DelegoLabs/Delego-backend)
- **Smart contracts**: [DelegoLabs/Delego-contracts](https://github.com/DelegoLabs/Delego-contracts)
- **Shared packages** (`@delegolabs/sdk`, `@delegolabs/types`): published to GitHub Packages

### 🎯 Key Features

- **Agent Delegation**: Create and manage shopping/payment task delegations
- **Approval Flows**: Approve or reject agent-initiated orders and spending
- **Escrow Tracking**: Monitor escrow-backed purchases end to end
- **Wallet Management**: Connect Stellar wallets and manage permissions
- **Order Tracking**: Real-time status timelines for delegated orders
- **Spending Analytics**: Overview of delegated spending and limits
- **Notifications**: In-app notifications for approvals, updates, and alerts

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL to your backend gateway URL

# Start the dev server
pnpm dev
```

Open http://localhost:3001

> **Note**: The app talks to the Delego API gateway (`apps/backend/gateway` in [DelegoLabs/Delego-backend](https://github.com/DelegoLabs/Delego-backend)). Start the backend repo first, or point `NEXT_PUBLIC_API_URL` at a deployed gateway.

### 🧪 Demo Mode

No backend, wallet, or funds needed — visit `/demo` (e.g. `http://localhost:3001/demo`) after `pnpm dev` and it drops you into a fully click-through-able app running against MSW fixtures, with a synthetic connected wallet. Every mutating action is disabled in the UI and rejected at the API-client layer if attempted anyway. Exit via the banner's "Exit demo" button, or just close the tab — the flag is session-scoped (`sessionStorage`) and never persists. See `apps/frontend/lib/demoMode.ts`.

For a **reproducible stakeholder walkthrough** (3 agents, 6 delegations across lifecycle stages, 40 orders over 60 days, escrows in every state, notifications, one dispute):

```bash
# Byte-identical JSON snapshot for tests / Storybook decorators
pnpm seed:demo --export

# Boot the Next.js dev server against that world via MSW
pnpm seed:demo --mock
```

See [docs/msw-mocking.md](./docs/msw-mocking.md) and `apps/frontend/mocks/generateDemoWorld.mjs`.

## 🔧 Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- A **GitHub token** with read access to the `DelegoLabs` packages on GitHub Packages (see [Authentication](#authentication))

## 🔐 Authentication

The app depends on the private packages `@delegolabs/sdk` and `@delegolabs/types` from GitHub Packages. Configure a token in your user-level `.npmrc`:

```bash
# ~/.npmrc
@delegolabs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<your-token>
```

## 📁 Project Structure

```
delego/
├── apps/
│   └── frontend/          # Consumer web application (Next.js)
│       ├── app/           # App Router routes
│       ├── components/    # React components
│       ├── hooks/         # React hooks
│       ├── lib/           # Utilities, helpers, and API client (lib/api.ts)
│       └── tests/         # Test suites
├── packages/
│   └── ui/                # Shared React component library (@delegolabs/ui)
├── .github/               # GitHub configuration and CI workflows
├── .env.example           # Environment variables template
├── package.json           # Root package.json
├── pnpm-workspace.yaml    # pnpm workspace configuration
└── tsconfig.base.json     # Base TypeScript configuration
```

## 🛠️ Development Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the web app (port 3001) |
| `pnpm build` | Build the UI package and web app |
| `pnpm typecheck` | Type-check all TypeScript projects |
| `pnpm lint` | Run ESLint |
| `pnpm --filter @delegolabs/web format` | Format code with Prettier |
| `pnpm test` | Run all test suites |
| `pnpm seed:demo --export` | Write a deterministic demo-world JSON snapshot |
| `pnpm seed:demo --mock` | Start the web app against the seeded MSW world |

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run in watch mode
pnpm --filter @delegolabs/web exec vitest
```

## 🏛️ Architecture

```
┌──────────────────────────────────────────────┐
│           Delego Web App (this repo)          │
│         @delegolabs/web · Next.js             │
│  approvals · delegations · escrows · orders   │
│  wallet · tracking · analytics · onboarding   │
└──────────────┬───────────────────────────────┘
               │  HTTPS / REST
               ▼
┌──────────────────────────────────────────────┐
│      Delego API Gateway & Microservices       │
│            (DelegoLabs/Delego-backend)        │
│  orchestrator · wallet · payments · agents    │
└──────────────┬───────────────────────────────┘
               │  Soroban RPC
               ▼
┌──────────────────────────────────────────────┐
│          Soroban Smart Contracts              │
│           (DelegoLabs/Delego-contracts)       │
│      escrow · permissions · reputation        │
└──────────────────────────────────────────────┘
```

Shared SDK and types (`@delegolabs/sdk`, `@delegolabs/types`) are consumed from GitHub Packages; the UI package (`@delegolabs/ui`) is a local workspace package.

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Use [Conventional Commits](https://www.conventionalcommits.org/).

## 📚 Documentation

- [docs/vision.md](./docs/vision.md) — Product vision
- [docs/problem.md](./docs/problem.md) — Problem statement
- [docs/grant-deliverables.md](./docs/grant-deliverables.md) — Grant deliverables
- [docs/architecture/system-design.md](./docs/architecture/system-design.md) — System design
- [docs/architecture/frontend-perf.md](./docs/architecture/frontend-perf.md) — Frontend performance budget
- [docs/dashboard-widget-composition.md](./docs/dashboard-widget-composition.md) — Suspense × ErrorBoundary widget matrix
- [docs/msw-mocking.md](./docs/msw-mocking.md) — MSW fixtures and `pnpm seed:demo`
- [docs/README.md](./docs/README.md) — Documentation index

## 🔒 Security

If you discover a security vulnerability, email **security@delego.dev**. Do not open a public issue.

## 📄 License

Delego is open-source software licensed under the [MIT License](./LICENSE).
