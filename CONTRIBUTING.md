# Contributing to Delego

Thank you for your interest in contributing to Delego! We welcome contributions from everyone and are excited to have you join our community.

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Project Areas](#project-areas)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)
- [Security](#security)
- [Community Guidelines](#community-guidelines)


### Prerequisites

Before you begin contributing, ensure you have the following installed:

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Git** (for version control)
- A **GitHub token** with read access to the `DelegoLabs` packages on GitHub Packages

### Setup Instructions

1. **Fork the Repository**
   ```bash
   # Fork the repository on GitHub
   # Then clone your fork
   git clone https://github.com/YOUR_USERNAME/delego.git
   cd delego
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your local configuration
   ```

4. **Start Development Server**
   ```bash
   pnpm dev
   ```

Open http://localhost:3001

> **Note**: This repo contains only the web application and UI package. The backend services and smart contracts live in [DelegoLabs/Delego-backend](https://github.com/DelegoLabs/Delego-backend) and [DelegoLabs/Delego-contracts](https://github.com/DelegoLabs/Delego-contracts). For a full local setup, also run the backend repo and point `NEXT_PUBLIC_API_URL` at its gateway.

## 🔄 Development Workflow

### 1. Choose an Issue

- Browse [GitHub Issues](https://github.com/DelegoLabs/Delego/issues) for open issues
- Look for issues labeled `good first issue` if you're new to the project
- Comment on the issue to claim it and ask questions if needed
- Create a new issue if you've found a bug or have a feature request

### 2. Create a Branch

```bash
# Ensure your main branch is up to date
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feat/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

**Branch Naming Convention:**
- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or changes
- `chore/` - Maintenance tasks

### 3. Make Your Changes

- Write clear, focused commits
- Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification
- Add tests for new functionality
- Update documentation as needed

**Commit Message Format:**
```
type(scope): subject

body

footer
```

Examples:
```
feat(delegations): add delegation creation form

Adds a form to create new agent delegations with spending limits.
Includes validation and submission to the delegations API.

Closes #123
```

```
fix(orders): correct status timeline sorting

Fixed the status timeline rendering out of order when multiple
events share the same timestamp.

Fixes #456
```

### 4. Test Your Changes

```bash
# Run type checking
pnpm typecheck

# Run linting
pnpm lint

# Run tests
pnpm test

# Run tests in watch mode
pnpm --filter @delegolabs/web exec vitest
```

### 5. Submit a Pull Request

- Push your branch to your fork
- Open a pull request against the `main` branch
- Use the PR template and provide a detailed description
- Link related issues
- Request review from maintainers

## 📐 Code Standards

### TypeScript

- **Strict Mode**: All TypeScript projects use strict mode
- **No `any`**: Avoid using `any` type without justification
- **Type Safety**: Leverage TypeScript's type system fully
- **Interfaces**: Use interfaces for object shapes
- **Enums**: Use enums for fixed sets of values
- **Null Checks**: Enable strict null checks
- **Naming**: Use camelCase for variables, PascalCase for types/classes

```typescript
// Good
interface User {
  id: string;
  name: string;
  email: string;
}

function getUserById(id: string): Promise<User | null> {
  // Implementation
}

// Bad
function getUserById(id: any): any {
  // Implementation
}
```

### React

- Use functional components with hooks
- Follow the React Hooks rules (no conditional hooks)
- Use the shared components from `@delegolabs/ui` where possible
- Keep components focused and reusable
- Follow accessibility best practices (semantic HTML, labels, keyboard navigation)

### General Guidelines

- **TODO Comments**: Mark incomplete logic with `// TODO:` and link to an issue when possible
- **Code Comments**: Add comments for complex logic, not obvious code
- **Function Length**: Keep functions focused and reasonably short
- **File Organization**: Group related functionality together
- **Imports**: Organize imports logically (external, internal, relative)

## 🎯 Project Areas

> **Note**: This repository contains the web application and shared UI package. The backend microservices and smart contracts live in separate repositories: [DelegoLabs/Delego-backend](https://github.com/DelegoLabs/Delego-backend) and [DelegoLabs/Delego-contracts](https://github.com/DelegoLabs/Delego-contracts).

### Customer Web Application (`apps/frontend`)

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS

**Good First Issues:**
- UI component improvements
- React hooks development
- Page layout enhancements
- Form validation
- State management

**Key Files:**
- `app/` - Next.js App Router routes
- `components/` - React components
- `hooks/` - Custom React hooks
- `lib/api.ts` - API client

### Shared UI Package (`packages/ui`)

**Tech Stack:** React, TypeScript

**Good First Issues:**
- Component design and implementation
- Accessibility improvements
- Testing
- Theming and styling

**Key Files:**
- `src/` - Components and hooks

The SDK, types, and utils packages are not developed in this repo; they are published to GitHub Packages (see `DelegoLabs/Delego-backend`).

## 🧪 Testing Guidelines

### Test Coverage

- Aim for high test coverage on critical paths
- Write unit tests for individual functions and components
- Write component tests with Vitest and Testing Library

### Test Structure

```typescript
// Component test example
import { render, screen } from '@testing-library/react';

describe('DelegationCard', () => {
  it('renders the delegation status', () => {
    render(<DelegationCard status="active" />);
    expect(screen.getByText('Active')).toBeDefined();
  });
});
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @delegolabs/web test
pnpm --filter @delegolabs/ui test

# Run in watch mode
pnpm --filter @delegolabs/web exec vitest
```

## 📚 Documentation

### When to Update Documentation

- Adding new features or pages
- Changing existing APIs
- Modifying architecture
- Updating configuration
- Adding new commands or scripts

### Documentation Files

- **README.md**: Project overview and quick start
- **CONTRIBUTING.md**: Contribution guidelines (this file)
- **docs/**: Detailed documentation
  - `docs/architecture/system-design.md`: System design
  - `docs/vision.md`: Product vision
  - `docs/grant-deliverables.md`: Grant deliverables

### Documentation Style

- Use clear, concise language
- Include code examples
- Provide step-by-step instructions
- Use proper formatting (headings, lists, code blocks)
- Keep documentation up to date with code changes

## 🔀 Pull Request Process

### Before Submitting

1. **Code Quality**
   - [ ] `pnpm typecheck` passes
   - [ ] `pnpm lint` passes
   - [ ] `pnpm test` passes
   - [ ] No console.log statements left in production code

2. **Testing**
   - [ ] Tests added for new functionality
   - [ ] All tests pass
   - [ ] Test coverage maintained or improved

3. **Documentation**
   - [ ] README updated if adding a new page or component
   - [ ] Comments added for complex logic

4. **Commit Messages**
   - [ ] Follows Conventional Commits specification
   - [ ] Clear and descriptive
   - [ ] Links to related issues

### Submitting the PR

1. **Title**: Use a clear, descriptive title following Conventional Commits
2. **Description**: Provide a detailed description of changes
3. **Related Issues**: Link to related issues using `Closes #123` or `Fixes #123`
4. **Screenshots**: Include screenshots for UI changes
5. **Checklist**: Complete the PR template checklist

### Review Process

- Maintainers will review your PR
- Address feedback in a timely manner
- Be open to suggestions and improvements
- Keep discussions focused and constructive

### After Merge

- Delete your feature branch
- Celebrate your contribution! 🎉

## 🐛 Reporting Issues

### Bug Reports

When reporting a bug, include:

1. **Clear Title**: Descriptive title for the issue
2. **Description**: Detailed description of the problem
3. **Reproduction Steps**: Steps to reproduce the issue
4. **Expected Behavior**: What you expected to happen
5. **Actual Behavior**: What actually happened
6. **Environment Details**:
   - OS: [e.g., macOS, Ubuntu, Windows]
   - Node version: [e.g., 20.0.0]
   - Browser (if applicable): [e.g., Chrome 120]

**Example:**
```
Title: Delegation list does not update after approving an order

Description:
After approving an order in the approvals page, the delegations list
on the home page still shows the old spending totals.

Steps to Reproduce:
1. Create a delegation with a spending limit
2. Approve an agent-initiated order against it
3. Navigate to the home page
4. Observe the delegation spending total is stale

Expected Behavior:
The delegation spending total reflects the approved order.

Actual Behavior:
The total only updates after a full page reload.

Environment:
- OS: Ubuntu 22.04
- Node: 20.0.0
```

### Feature Requests

When requesting a feature, include:

1. **Clear Title**: Descriptive title for the feature
2. **Description**: Detailed description of the feature
3. **Use Case**: Why this feature is needed
4. **Proposed Solution**: How you envision the feature working
5. **Alternatives**: Any alternative solutions considered
6. **Additional Context**: Any other relevant information

## 🔒 Security

### Reporting Security Vulnerabilities

**Do not** open public issues for security vulnerabilities.

To report a security vulnerability:

1. Email us at: security@delego.dev
2. Include details and reproduction steps
3. We will respond promptly and coordinate disclosure
4. We will work with you to fix the issue
5. We will coordinate the public disclosure timeline

### Security Best Practices

- Never commit secrets or API keys
- Use environment variables for sensitive configuration
- Review dependencies for known vulnerabilities
- Follow secure coding practices
- Test security-related functionality thoroughly

## 🤝 Community Guidelines

### Code of Conduct

Please read and follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

### Communication

- Be respectful and constructive in all communications
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

### Getting Help

- Check existing documentation first
- Search GitHub Issues for similar problems
- Ask questions in GitHub Discussions
- Join our community chat (link coming soon)

### Recognition

Contributors will be recognized in release notes and project documentation.

## 📞 Contact

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Security**: security@delego.dev (for security issues only)

## 🙏 Thank You

Thank you for contributing to Delego! Your contributions help make AI-powered delegated commerce more accessible and secure for everyone.
