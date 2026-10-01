# Frontend Vulnerabilities, Errors & Implementation Backlog (75 Issues)

Developer-ready issues covering vulnerabilities, errors, runtime bugs, and implementations.
**Total Issues:** 75
**Target Sizing:** 1–2 developer-days per issue.

---

## Fix Next.js 15 Asynchronous PageProps Type Failure in Storefront Dynamic Route

- **Estimate:** 1 day
- **Context:** Running `pnpm typecheck` in `apps/frontend` currently fails with TS2344 in `app/store/[merchantId]/page.tsx` because Next.js 15 App Router requires `params` to be `Promise<{ merchantId: string }>`, whereas the component currently defines `params: StoreParams | Promise<StoreParams>`.

### Data Types & Schemas
```typescript
export interface StorefrontPageProps {
  params: Promise<{ merchantId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}
```

### Tasks
- Update `StorePage` and `generateMetadata` in `app/store/[merchantId]/page.tsx` to await `params: Promise<{ merchantId: string }>`.
- Remove ambiguous union types that fail Next.js 15 type constraint check.
- Run `pnpm typecheck` to ensure zero compilation errors across `@delegolabs/web`.

### Acceptance Criteria
- `pnpm --filter @delegolabs/web typecheck` passes with 0 errors.
- Next.js App Router correctly resolves dynamic `merchantId` at runtime.

---

## Fix React 19 Server/Client Hydration Mismatch on Formatted Stellar Balances

- **Estimate:** 1 day
- **Context:** When formatting Stroop token balances and localized timestamps on server-rendered pages, differing user locale and currency formatters cause React hydration mismatch warnings (`Warning: Text content did not match. Server: '$100.00' Client: '100,00 €'`).

### Data Types & Schemas
```typescript
export interface FormattedBalanceProps {
  stroopAmount: bigint | string;
  decimals?: number;
  currencyCode?: string;
  fallbackPlaceholder?: string;
}
```

### Tasks
- Implement a two-pass rendering hook or `suppressHydrationWarning` on localized balance labels.
- Render stable skeleton placeholders on initial server render before mounting client locale.
- Add Vitest unit tests verifying hydration stability.

### Acceptance Criteria
- Zero React hydration mismatch errors in browser console during page load.
- Localized balances format accurately once mounted on the client.

---

## Fix Infinite Re-Render Loop in useContractEvents Hook on Filter Object Recreation

- **Estimate:** 1 day
- **Context:** In `apps/frontend/hooks/useContractEvents.ts`, passing inline filter objects as dependencies to `useEffect` causes re-subscription on every render pass, flooding the Soroban RPC WebSocket with duplicate subscription channels.

### Data Types & Schemas
```typescript
export interface ContractEventFilter {
  contractAddress: string;
  topics: Array<string | symbol>;
  fromLedger?: number;
}
```

### Tasks
- Memoize filter objects using `useMemo` or custom deep comparison `useDeepCompareEffect`.
- Ensure existing WebSocket channels are unsubscribed before initiating new connections.
- Add React Testing Library test verifying only a single subscription is created.

### Acceptance Criteria
- `useContractEvents` triggers subscription only when filter properties genuinely change.
- No unneeded RPC reconnections during parent component re-renders.

---

## Handle Stellar Wallet Rejection Gracefully Without Uncaught Promise Exceptions

- **Estimate:** 1 day
- **Context:** When a user dismisses the Freighter, Albedo, or Lobstr extension popup, the wallet adapter rejects with a generic error that is not caught in certain UI actions, surfacing as unhandled promise rejections in Sentry.

### Data Types & Schemas
```typescript
export type WalletErrorType = "user_declined" | "wallet_locked" | "insufficient_fee" | "network_error";

export interface WalletErrorDetails {
  code: WalletErrorType;
  message: string;
  walletName: string;
}
```

### Tasks
- Intercept wallet rejection codes (`-4`, `User declined to sign transaction`) in `services/wallet`.
- Display an inline user-friendly toast notice (`Transaction cancelled by user`) rather than an error banner.
- Ensure loading spinners are reset immediately on rejection.

### Acceptance Criteria
- User cancellation resets UI state cleanly without unhandled console errors.
- Toast message informs user of cancellation without triggering error alerts.

---

## Fix Memory Leak in Server-Sent Events Chat Stream Listener on Drawer Close

- **Estimate:** 1 day
- **Context:** When a user closes the Buyer Agent chat drawer while an AI streaming response is active, the `EventSource` connection continues streaming in the background, consuming CPU and leaking memory.

### Data Types & Schemas
```typescript
export interface SseStreamController {
  abort(): void;
  isConnected: boolean;
  activeMessageId: string | null;
}
```

### Tasks
- Bind an `AbortController` signal to the active SSE fetch connection in `useBuyerAgentChat`.
- Invoke `abort()` in the `useEffect` cleanup return function when drawer unmounts.
- Add unit tests verifying connection termination upon unmounting.

### Acceptance Criteria
- Closing the chat drawer terminates inflight HTTP streams immediately.
- Zero background state updates on unmounted components.

---

## Fix Layout Shift (CLS) on Dynamic Font Glyph and SVG Icon Loading

- **Estimate:** 1 day
- **Context:** Navigation icons and financial asset symbols load asynchronously without fixed bounding dimensions, causing Cumulative Layout Shift (CLS > 0.15) on initial storefront page loads.

### Data Types & Schemas
```typescript
export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  ariaLabel?: string;
  reserveLayoutSpace?: boolean;
}
```

### Tasks
- Set explicit `width`, `height`, and `aspect-ratio` on all SVG icons and currency tokens.
- Preload critical UI fonts using `next/font` with `display: 'swap'` and layout fallback font metrics.
- Verify Lighthouse CLS metric stays strictly under 0.05.

### Acceptance Criteria
- Lighthouse CLS score improves to < 0.05 on mobile and desktop.
- No visible layout jumping as assets load.

---

## Resolve Broken Deep-Linking and State Loss on Page Refresh in Dispute Stepper

- **Estimate:** 1 day
- **Context:** In `app/disputes/[disputeId]/page.tsx`, refreshing the browser during step 3 (Evidence Upload) resets the wizard to step 1, losing user-entered descriptions and attached files.

### Data Types & Schemas
```typescript
export interface DisputeWizardState {
  currentStep: number;
  orderId: string;
  disputeReason: string;
  uploadedEvidenceIds: string[];
}
```

### Tasks
- Synchronize active wizard step with URL query parameter `?step=3` via Next.js router.
- Persist draft evidence form state in `sessionStorage` until final submission.
- Restore form state seamlessly upon browser refresh.

### Acceptance Criteria
- Refreshing the page retains the current step and draft input fields.
- URL query parameters reflect the active wizard step.

---

## Fix Next.js Error Boundary Blank Screen on Uncaught API Route Exceptions

- **Estimate:** 1 day
- **Context:** When a backend API endpoint returns an unexpected 500 status code, `global-error.tsx` renders a blank screen without clear retry buttons or error diagnostics.

### Data Types & Schemas
```typescript
export interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
}
```

### Tasks
- Design a resilient error recovery screen with `Try Again` and `Return to Dashboard` actions.
- Log error digest to console and Sentry without leaking internal server stack traces to user.
- Add Vitest test verifying error boundary renders recovery controls.

### Acceptance Criteria
- Users receive an interactive error card with a working retry action on runtime exceptions.
- Blank screen crashes are completely eliminated.

---

## Fix Stale Optimistic UI State on Cancelled Escrow Deposit Transactions

- **Estimate:** 1 day
- **Context:** When a buyer clicks 'Cancel Escrow', the UI optimistically marks the order as cancelled. If the on-chain cancellation transaction reverts, the UI stays in cancelled state until full page reload.

### Data Types & Schemas
```typescript
export interface OptimisticAction<T> {
  type: "UPDATE_STATUS";
  previousState: T;
  optimisticState: T;
  txHashPromise: Promise<string>;
}
```

### Tasks
- Wrap optimistic state mutations with automatic rollback on transaction promise rejection.
- Show a warning toast notifying the buyer that the cancellation failed on-chain.
- Refetch fresh on-chain contract state immediately upon failure.

### Acceptance Criteria
- Failed transactions immediately revert UI to accurate on-chain state.
- Clear feedback alerts user of transaction revert.

---

## Fix BigInt String Serialization Failure in SWR / React Query Key Deduplication

- **Estimate:** 1 day
- **Context:** Passing raw `BigInt` amounts inside query keys (e.g. `['quote', amountBigInt]`) triggers `TypeError: Do not know how to serialize a BigInt` when React Query serializes cache keys.

### Data Types & Schemas
```typescript
export function serializeQueryKey(key: unknown[]): string {
  return JSON.stringify(key, (_, v) => (typeof v === "bigint" ? v.toString() : v));
}
```

### Tasks
- Implement a custom `queryKeyHashFn` handling `BigInt` values across QueryClient options.
- Convert raw BigInt parameters to explicit string representations in query hooks.
- Add unit tests validating query key hashing with large integer balances.

### Acceptance Criteria
- React Query keys never throw serialization errors on BigInt values.
- Cache deduplication operates correctly for large Stroop balances.

---

## Fix Broken Dynamic Route Metadata Generation in Merchant Storefront Pages

- **Estimate:** 1 day
- **Context:** In `apps/frontend/app/store/[merchantId]/page.tsx`, if the merchant ID is invalid or API lookup times out, `generateMetadata` throws an uncaught exception, resulting in HTTP 500 instead of rendering standard fallback metadata.

### Data Types & Schemas
```typescript
export interface StoreMetadataFallback {
  title: string;
  description: string;
  isNotFound: boolean;
}
```

### Tasks
- Wrap metadata fetching in try/catch block returning fallback title `"Merchant Store | Delego"` on error.
- Prevent API lookup timeouts from aborting server page rendering.
- Add automated test verifying metadata fallback on unknown merchant IDs.

### Acceptance Criteria
- Unknown or invalid merchant routes generate clean fallback OpenGraph metadata.
- Zero 500 server errors caused by metadata generation.

---

## Resolve Sentry Client-Side Source Map Leakage in Production Bundle Generation

- **Estimate:** 1 day
- **Context:** Production Next.js builds currently output unhidden `.map` files in public `.next/static` bundles, exposing source code and internal variable names in production.

### Data Types & Schemas
```javascript
// next.config.ts sentry configuration
sentry: {
  hideSourceMaps: true,
  widenClientFileUpload: true,
}
```

### Tasks
- Configure `hideSourceMaps: true` in Next.js Sentry configuration.
- Ensure source maps are uploaded directly to Sentry release artifacts and stripped from client distribution.
- Verify built `.next` static directory contains zero accessible `.map` files.

### Acceptance Criteria
- Source maps are uploaded securely to Sentry without public distribution.
- Client bundles cannot be reverse-engineered via public map URLs.

---

## Fix Broken Keyboard Tab Focus Trapping Inside Slide-Out Buyer Agent Drawer

- **Estimate:** 1 day
- **Context:** When the conversational chat drawer is open, keyboard `Tab` navigation escapes the drawer and focuses hidden background elements, violating WCAG 2.1 AA accessibility guidelines.

### Data Types & Schemas
```typescript
export interface FocusTrapOptions {
  containerRef: React.RefObject<HTMLElement>;
  isActive: boolean;
  onEscape?: () => void;
}
```

### Tasks
- Implement focus trapping using `@radix-ui/react-dialog` or custom focus-lock hook.
- Cycle tab focus exclusively within drawer elements when open.
- Restore focus to the opening trigger button when drawer is closed with `Escape`.

### Acceptance Criteria
- Keyboard focus remains trapped within the active drawer.
- Pressing `Escape` closes the drawer and restores focus to original element.

---

## Fix RTL (Right-to-Left) Layout Mirroring in Arabic and Hebrew Localized Views

- **Estimate:** 1 day
- **Context:** Switching language to Arabic causes chat speech bubbles, chevron icons, and navigation drawers to render with broken left-to-right alignment and misplaced close buttons.

### Data Types & Schemas
```typescript
export type TextDirection = "ltr" | "rtl";

export interface LocaleConfig {
  locale: string;
  direction: TextDirection;
}
```

### Tasks
- Replace directional Tailwind utility classes (`pl-*`, `mr-*`, `left-*`) with logical properties (`ps-*`, `me-*`, `start-*`, `end-*`).
- Set `dir="rtl"` dynamically on document root based on active language.
- Verify chat message bubbles and drawer animations mirror accurately in RTL.

### Acceptance Criteria
- RTL layouts mirror properly without clipping or misalignment.
- All icons and text flow naturally according to locale direction.

---

## Fix Turborepo Remote Caching Hash Invalidation on Static Build Scripts

- **Estimate:** 1 day
- **Context:** Running `turbo build` frequently misses cache because timestamps in generated package metadata cause non-deterministic artifact hashes across machines.

### Data Types & Schemas
```json
// turbo.json inputs optimization
{
  "tasks": {
    "build": {
      "inputs": ["src/**", "app/**", "public/**", "package.json", "tsconfig.json"]
    }
  }
}
```

### Tasks
- Refine `turbo.json` task inputs to exclude ephemeral build logs and temp directories.
- Ensure deterministic code generation in `packages/api-generated`.
- Verify remote cache hits exceed 80% on clean rebuilds without source changes.

### Acceptance Criteria
- Clean rebuilds hit Turborepo cache reliably.
- CI build times are reduced by >50% on warm cache.

---

## Mitigate DOM-Based Cross-Site Scripting (XSS) in AI Chat Markdown Rendering

- **Estimate:** 2 days
- **Context:** The Buyer Agent chat drawer renders raw Markdown responses from the LLM. If an adversarial prompt or untrusted merchant description injects `<img src=x onerror=alert()>` or `javascript:` links, malicious scripts could execute in the buyer's session.

### Data Types & Schemas
```typescript
import DOMPurify from "dompurify";

export interface SafeMarkdownProps {
  content: string;
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
}
```

### Tasks
- Sanitize all LLM Markdown output using `DOMPurify.sanitize()` before rendering.
- Disallow `script`, `iframe`, `object`, and inline event attributes (`onerror`, `onload`).
- Validate that links enforce `target="_blank"` and `rel="noopener noreferrer"`.
- Add automated test cases with standard XSS injection test vectors.

### Acceptance Criteria
- All rendered HTML tags are strictly sanitized.
- Malicious script injection attempts are neutralized.

---

## Migrate Insecure LocalStorage Ephemeral Session Keys to Web Workers

- **Estimate:** 2 days
- **Context:** Temporary session signing keys stored in browser `localStorage` are vulnerable to extraction by any third-party script or browser extension with access to the origin's storage.

### Data Types & Schemas
```typescript
export interface SessionKeyWorkerMessage {
  type: "SIGN_PAYLOAD" | "CLEAR_KEY" | "INIT_KEY";
  payload?: Uint8Array;
  keyId?: string;
}
```

### Tasks
- Implement a dedicated Web Worker holding the ephemeral private key in isolated worker memory.
- Sign transactions via `postMessage` RPC without exposing raw private key bytes to the main thread.
- Ensure the worker wipes key memory on session logout or page close.

### Acceptance Criteria
- Private keys are never accessible from DOM `window.localStorage`.
- Web Worker handles signing operations safely.

---

## Implement Strict Content-Security-Policy (CSP) Headers Against Clickjacking

- **Estimate:** 1 day
- **Context:** The web application currently lacks `frame-ancestors 'none'` in HTTP response headers, allowing an attacker to embed the Delego payment modal inside a transparent iframe for UI redress / clickjacking attacks.

### Data Types & Schemas
```typescript
export const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "frame-ancestors 'none'",
  "connect-src 'self' https://*.stellar.org https://*.soroban-rpc.com wss://*.soroban-rpc.com",
].join("; ");
```

### Tasks
- Configure CSP headers in `middleware.ts` including `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- Restrict `connect-src` strictly to approved Stellar RPC and backend API endpoints.
- Audit CSP violations using report-only mode before full enforcement.

### Acceptance Criteria
- Application cannot be embedded in third-party iframes.
- Clickjacking defense passes security header audits.

---

## Sanitize User-Uploaded SVG Merchant Logos Against Embedded Malicious JavaScript

- **Estimate:** 1 day
- **Context:** Merchants can upload custom SVG logo files. Unsanitized SVG files can contain embedded `<script>` or `<svg onload=...>` tags that execute in the context of the user visiting the storefront.

### Data Types & Schemas
```typescript
export function sanitizeSvgXml(rawSvgString: string): string {
  return DOMPurify.sanitize(rawSvgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}
```

### Tasks
- Sanitize SVG files on client upload before uploading to S3 / displaying in UI.
- Strip all embedded `<script>` tags, foreign objects, and event attributes.
- Add tests verifying that malicious SVGs are sanitized into safe vector graphics.

### Acceptance Criteria
- Uploaded SVGs contain zero executable script payloads.
- Sanitized SVGs render correctly without visual corruption.

---

## Debounce and Disable Submit Buttons to Prevent Accidental Double-Spending

- **Estimate:** 1 day
- **Context:** When a buyer clicks 'Confirm Escrow Deposit', rapid repeated clicks before the wallet popup opens can trigger duplicate wallet signing requests and double-spend transactions.

### Data Types & Schemas
```typescript
export interface UseTransactionLock {
  isLocked: boolean;
  acquireLock(): boolean;
  releaseLock(): void;
}
```

### Tasks
- Implement a global transaction lock hook disabling all deposit and release buttons upon click.
- Show an immediate loading state (`Submitting to Stellar...`) while wallet interaction is active.
- Release lock only when transaction resolves or user declines.

### Acceptance Criteria
- Buttons cannot be clicked more than once per transaction lifecycle.
- Double-spend submission attempts are completely prevented in the UI.

---

## Mitigate Open Redirect Vulnerabilities on Authentication Callbacks

- **Estimate:** 1 day
- **Context:** The auth callback page reads the `returnTo` query parameter directly and invokes `router.push(returnTo)`. An attacker can craft links like `https://delego.app/login?returnTo=https://malicious.com` to phish users.

### Data Types & Schemas
```typescript
export function sanitizeRedirectUrl(url: string | null | undefined): string {
  if (!url || !url.startsWith("/") || url.startsWith("//")) {
    return "/dashboard";
  }
  return url;
}
```

### Tasks
- Validate that `returnTo` paths start with a single `/` and do not contain protocol specifiers (`https:`, `//`).
- Fall back to `/dashboard` for any external or malformed URLs.
- Add automated test cases validating open redirect sanitization.

### Acceptance Criteria
- External URLs in `returnTo` parameters are strictly rejected.
- Post-login redirects only navigate within internal application routes.

---

## Scrub Sensitive PII and Secret Keys in Sentry Client-Side Telemetry

- **Estimate:** 1 day
- **Context:** Client error reports sent to Sentry capture user form inputs, full shipping addresses, and wallet keys in breadcrumbs and exception scopes.

### Data Types & Schemas
```typescript
// Sentry beforeSend filter
export function scrubSentryEvent(event: import("@sentry/nextjs").Event): import("@sentry/nextjs").Event {
  // Scrub PII, emails, and Stellar secret keys (S...)
}
```

### Tasks
- Implement `beforeSend` scrubbing in `sentry.client.config.ts`.
- Redact 56-character Stellar secret keys (`S...`), emails, and street addresses from breadcrumbs.
- Mask password and credit card input fields in session replays.

### Acceptance Criteria
- No private keys or customer PII are transmitted to Sentry.
- Session replays adhere to privacy masking standards.

---

## Implement Complete Sensitive State Purge on User Logout

- **Estimate:** 1 day
- **Context:** Clicking 'Log Out' currently clears authentication cookies but leaves cached query data, wallet public keys, and chat conversation history accessible in browser memory until a full refresh.

### Data Types & Schemas
```typescript
export function performCompleteLogout(queryClient: import("@tanstack/react-query").QueryClient): void {
  // wipe caches, storage, session keys
}
```

### Tasks
- Call `queryClient.clear()` to invalidate and wipe all cached API responses.
- Clear `sessionStorage` and temporary memory stores holding wallet state.
- Redirect to public landing page cleanly.

### Acceptance Criteria
- Logging out leaves zero residual user data or cached balances in memory.
- Re-logging in displays pristine state.

---

## Enforce Subresource Integrity (SRI) on External CDN Scripts and Styles

- **Estimate:** 1 day
- **Context:** Any externally referenced script tags (e.g. Turnstile CAPTCHA or analytics) lack `integrity` hashes, leaving users vulnerable if an external CDN is compromised.

### Data Types & Schemas
```html
<script 
  src="https://challenges.cloudflare.com/turnstile/v0/api.js"
  integrity="sha384-..."
  crossorigin="anonymous"
  async
></script>
```

### Tasks
- Compute cryptographic SHA-384 hashes for all external CDN dependencies.
- Add `integrity` and `crossorigin="anonymous"` attributes to script tags.
- Configure build verification script asserting all external assets include SRI.

### Acceptance Criteria
- Tampered third-party scripts are blocked by the browser.
- SRI verification passes security checks.

---

## Implement Phishing Defense with Mandatory rel=noopener noreferrer on Store Links

- **Estimate:** 1 day
- **Context:** External merchant links rendered in the storefront and chat drawer omit `rel="noopener noreferrer"`, allowing target external sites to access `window.opener` and redirect the buyer to phishing pages.

### Data Types & Schemas
```typescript
export interface ExternalLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}
```

### Tasks
- Create a standardized `ExternalLink` component enforcing `target="_blank"` and `rel="noopener noreferrer"`.
- Replace all raw `<a>` tags targeting external URLs with `ExternalLink`.
- Verify all outgoing links protect `window.opener`.

### Acceptance Criteria
- External links cannot manipulate opening window context.
- Linter rule enforces `rel="noopener noreferrer"` on blank targets.

---

## Implement WebAuthn RP ID and Origin Verification to Block Passkey Replay

- **Estimate:** 2 days
- **Context:** Client WebAuthn requests must strictly specify `rpId: window.location.hostname` to prevent phishing domains from harvesting and replaying biometric assertions on malicious mirrors.

### Data Types & Schemas
```typescript
export interface WebAuthnClientOptions {
  rpId: string;
  challenge: string;
  timeout: number;
  userVerification: "preferred" | "required";
}
```

### Tasks
- Explicitly configure `rpId` matching the current host domain in passkey prompts.
- Verify server response matches client origin before completing biometric signature.
- Add tests testing rejection of mismatched RP ID origins.

### Acceptance Criteria
- Passkeys operate strictly within the authentic Delego domain.
- Cross-origin replay attempts are blocked.

---

## Implement Maskable High-Value Balances with Toggleable Privacy Eye in Header

- **Estimate:** 1 day
- **Context:** Displaying large Stellar token balances in the navigation bar exposes buyers and merchants to shoulder-surfing attacks when working in public spaces.

### Data Types & Schemas
```typescript
export interface BalancePrivacyState {
  isMasked: boolean;
  toggleMask(): void;
}
```

### Tasks
- Implement a privacy toggle button in the header displaying `••••••` when masked.
- Persist privacy preference in `localStorage`.
- Provide keyboard shortcut (e.g. `Alt + P`) to toggle balance visibility instantly.

### Acceptance Criteria
- Users can hide their balances with a single click.
- Masking preference persists across sessions.

---

## Implement Tapjacking and Touch Redress Defense on Mobile Fund Releases

- **Estimate:** 1 day
- **Context:** On mobile devices, malicious overlays or rapid touches can inadvertently trigger 'Release Escrow Funds' without deliberate user confirmation.

### Data Types & Schemas
```typescript
export interface SwipeToConfirmProps {
  onConfirm: () => void;
  isLoading: boolean;
  label: string;
}
```

### Tasks
- Implement a 'Slide to Confirm' swipe action for high-value fund releases on mobile.
- Require continuous touch gesture rather than a single touch tap.
- Provide tactile haptic feedback on successful confirmation.

### Acceptance Criteria
- Accidental taps cannot trigger irreversible escrow releases.
- Swipe-to-confirm functions smoothly across touch devices.

---

## Implement Automatic Session Timeout on Inactivity for Sensitive Dashboards

- **Estimate:** 1 day
- **Context:** If a merchant or finance manager leaves the approval dashboard unattended, unauthorized individuals can approve pending expenditures without re-authentication.

### Data Types & Schemas
```typescript
export interface InactivityTimeoutConfig {
  timeoutMinutes: number; // e.g. 15 minutes
  warningMinutes: number; // e.g. 2 minutes before logout
  onTimeout(): void;
}
```

### Tasks
- Track user interaction events (`mousemove`, `keydown`, `touchstart`).
- Display a 2-minute countdown modal before session expiration.
- Lock the interface and require biometric or password re-entry on timeout.

### Acceptance Criteria
- Inactivity locks the dashboard after the configured duration.
- Active users can extend session with a single click.

---

## Enforce Strict Input Validation on Stellar Public Key Paste Inputs

- **Estimate:** 1 day
- **Context:** Pasting invalid or malformed Stellar addresses (e.g. missing characters, lowercase letters, or secret keys starting with 'S') can lead to lost funds or unhandled contract errors.

### Data Types & Schemas
```typescript
import { StrKey } from "@stellar/stellar-sdk";

export function isValidStellarPublicKey(key: string): boolean {
  return StrKey.isValidEd25519PublicKey(key);
}
```

### Tasks
- Validate all address input fields using `@stellar/stellar-sdk` `StrKey.isValidEd25519PublicKey`.
- Explicitly reject and alert if user mistakenly pastes a secret key (`S...`).
- Display visual green checkmark or red error feedback immediately on input.

### Acceptance Criteria
- Invalid addresses are flagged before transaction submission.
- Secret keys pasted in public fields trigger a critical warning.

---

## Implement Soroban Transaction Simulation Dry-Run Modal with Resource Breakdown

- **Estimate:** 2 days
- **Context:** Users need complete transparency on estimated gas fees, storage rent, and contract state changes before confirming a Soroban transaction.

### Data Types & Schemas
```typescript
export interface SimulationDetails {
  cpuInstructions: number;
  ramBytes: number;
  resourceFeeXlm: string;
  storageChanges: Array<{ key: string; changeType: "created" | "updated" | "deleted" }>;
  isSuccess: boolean;
}
```

### Tasks
- Run contract simulation before prompting wallet signing popup.
- Display visual gauge of CPU and RAM usage against network limits.
- Show human-readable summary of state changes and final fee.

### Acceptance Criteria
- Buyers can review simulation outcomes and exact fees prior to signing.
- Failed simulations display root-cause diagnostics clearly.

---

## Implement Real-Time Carrier Shipment Interactive Tracking Timeline with Map Pins

- **Estimate:** 2 days
- **Context:** Provide buyers with an interactive shipment timeline showing checkpoints, estimated delivery dates, and current carrier status (In Transit, Out for Delivery, Delivered).

### Data Types & Schemas
```typescript
export interface TrackingCheckpoint {
  title: string;
  location: string;
  timestamp: Date;
  status: "completed" | "current" | "upcoming";
  notes?: string;
}
```

### Tasks
- Build an animated vertical timeline component in `@delegolabs/ui`.
- Poll tracking status updates via Server-Sent Events or SWR.
- Display progress bar indicating transit percentage.

### Acceptance Criteria
- Tracking milestones update in real-time as carrier scans package.
- Timeline clearly highlights current delivery state.

---

## Implement WCAG 2.1 AA Screen Reader Live Regions for Dynamic AI Agent Chat

- **Estimate:** 2 days
- **Context:** Visually impaired users using screen readers (NVDA, VoiceOver) do not receive spoken announcements when the AI agent streams new message tokens into the chat drawer.

### Data Types & Schemas
```html
<div 
  aria-live="polite" 
  aria-atomic="false" 
  aria-relevant="additions text" 
  className="sr-only"
>
  {currentStreamingToken}
</div>
```

### Tasks
- Add `aria-live="polite"` regions announcing completed agent sentences.
- Ensure assistive technologies announce agent proposal cards and checkout buttons.
- Test keyboard navigation and announcements using screen reader tools.

### Acceptance Criteria
- Screen readers announce agent updates without cutting off previous sentences.
- WCAG 2.1 AA accessibility audit passes.

---

## Implement Offline Mode Banner and Service Worker Cache for Browse-Only Storefront

- **Estimate:** 2 days
- **Context:** Allow buyers to browse previously visited merchant catalogs and review order details even when offline or experiencing poor mobile connectivity.

### Data Types & Schemas
```typescript
export interface OfflineStatus {
  isOffline: boolean;
  cachedOrdersCount: number;
  lastSyncedAt: Date | null;
}
```

### Tasks
- Register a service worker caching catalog assets and merchant pages.
- Display an amber 'Offline Mode — Browse Only' banner when internet is disconnected.
- Disable checkout and deposit buttons until connectivity is restored.

### Acceptance Criteria
- Storefront remains browsable without network connection.
- Banner alerts user of offline status gracefully.

---

## Implement Multi-Wallet Selector Supporting Freighter, Albedo, Lobstr, and xBull

- **Estimate:** 2 days
- **Context:** Expand wallet support beyond Freighter to include Albedo (web-based), Lobstr (mobile QR), and xBull to broaden accessible user base.

### Data Types & Schemas
```typescript
export type SupportedWallet = "freighter" | "albedo" | "lobstr" | "xbull" | "walletconnect";

export interface WalletOption {
  id: SupportedWallet;
  name: string;
  iconUrl: string;
  isInstalled: boolean;
  connect(): Promise<string>;
}
```

### Tasks
- Integrate `@creit.tech/stellar-wallets-kit` or custom multi-wallet adapter.
- Detect installed browser extensions dynamically.
- Display clean modal with wallet options and connection statuses.

### Acceptance Criteria
- Users can connect with any of the 4 supported Stellar wallets.
- Session persists active wallet choice across page navigation.

---

## Implement Interactive Path Payment Slippage Tolerance Slider with Reserves

- **Estimate:** 2 days
- **Context:** When paying in token A and settling in token B, buyers need to configure slippage tolerance (0.1%, 0.5%, 1.0%, custom) and view estimated price impact.

### Data Types & Schemas
```typescript
export interface PathPaymentQuote {
  sourceToken: string;
  sourceAmount: string;
  destinationToken: string;
  destinationAmount: string;
  estimatedPriceImpactPercent: number;
  slippageTolerancePercent: number;
}
```

### Tasks
- Build an interactive slippage slider and preset buttons (0.1%, 0.5%, 1.0%).
- Show warning color (red/amber) if estimated price impact exceeds 2%.
- Calculate minimum received amount dynamically based on selected slippage.

### Acceptance Criteria
- Buyers can adjust slippage parameters with live quote updates.
- Excessive price impact displays prominent warning.

---

## Implement Client-Side PDF and CSV Invoice Generator for Settled Orders

- **Estimate:** 2 days
- **Context:** Buyers and merchants require downloadable tax invoices and receipts with cryptographic order hashes and VAT breakdowns directly from the browser.

### Data Types & Schemas
```typescript
export interface InvoiceData {
  orderId: string;
  escrowId: string;
  buyerAddress: string;
  merchantName: string;
  items: Array<{ name: string; quantity: number; unitPriceStroops: bigint }>;
  totalAmountStroops: bigint;
  taxAmountStroops: bigint;
  settledAt: Date;
}
```

### Tasks
- Implement PDF invoice generator using `jspdf` and `jspdf-autotable`.
- Include QR code linking to on-chain transaction explorer.
- Add CSV export for batch orders.

### Acceptance Criteria
- Clicking 'Download Invoice' produces a formatted PDF receipt.
- Invoice includes complete order breakdown and transaction hash.

---

## Implement Live Soroban RPC Network Health and Latency Indicator in Header

- **Estimate:** 1 day
- **Context:** Display a discreet network indicator in the application header showing current Soroban RPC ping latency and network status (Testnet / Mainnet).

### Data Types & Schemas
```typescript
export interface NetworkHealthState {
  network: "mainnet" | "testnet";
  rpcLatencyMs: number;
  latestLedger: number;
  status: "optimal" | "degraded" | "down";
}
```

### Tasks
- Ping Soroban RPC `getLatestLedger` every 30 seconds.
- Display colored badge (Green < 200ms, Amber 200-800ms, Red > 800ms).
- Provide modal showing RPC endpoint and node synchronization details.

### Acceptance Criteria
- Users have instant visibility into live blockchain network responsiveness.
- Degraded status alerts users before initiating transactions.

---

## Implement Buyer Agent Contextual Quick Prompt Suggestion Chips

- **Estimate:** 1 day
- **Context:** When opening the chat drawer, provide first-time buyers with one-click prompt suggestion chips (e.g. 'Find mechanical keyboards under $100', 'Check delivery status').

### Data Types & Schemas
```typescript
export interface PromptChip {
  id: string;
  label: string;
  promptText: string;
  category: "search" | "orders" | "disputes" | "settings";
}
```

### Tasks
- Render categorized prompt chips above the chat input box.
- Populate input and trigger agent query upon clicking a chip.
- Dismiss chips once conversation begins.

### Acceptance Criteria
- Clicking a chip submits the selected prompt to the agent.
- Chips adapt to user context (e.g. suggesting dispute actions if orders are active).

---

## Implement Dark Mode and High Contrast Theme Switcher with Tailwind CSS

- **Estimate:** 1 day
- **Context:** Support system preference detection and manual toggle between Light, Dark, and High Contrast accessibility themes with smooth color transitions.

### Data Types & Schemas
```typescript
export type ThemeMode = "light" | "dark" | "high-contrast" | "system";

export interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: "light" | "dark" | "high-contrast";
  setTheme(theme: ThemeMode): void;
}
```

### Tasks
- Configure Tailwind CSS `darkMode: 'class'` with semantic color variables.
- Implement high-contrast tokens meeting WCAG AAA color contrast ratios (7:1).
- Persist selection in `localStorage` without flash of unstyled content (FOUC).

### Acceptance Criteria
- Theme switches instantly with zero layout flash.
- High contrast mode satisfies WCAG AAA contrast requirements.

---

## Implement Multi-Sig Dual-Control Approval Dashboard with Pending Badges

- **Estimate:** 2 days
- **Context:** [approvals] Provide enterprise team managers with an approval dashboard listing transactions requiring secondary signatures.

### Data Types & Schemas
```typescript
export interface PendingApprovalItem {
  orderId: string;
  requestedBy: string;
  amountStroops: bigint;
  recipient: string;
  expiresAt: Date;
}
```

### Tasks
- Build pending approval queue view
- Implement 1-click approve and sign action
- Add badge counter in navigation

### Acceptance Criteria
- `Implement Multi-Sig Dual-Control Approval Dashboard with Pending Badges` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Real-Time Accrued Yield Counter with Micro-Animations for Blend Escrows

- **Estimate:** 1 day
- **Context:** [escrow] Display an animated ticker showing real-time yield accumulating on active yield-bearing escrow deposits.

### Data Types & Schemas
```typescript
export interface YieldCounterProps {
  principalStroops: bigint;
  aprBps: number;
  depositTimestamp: number;
}
```

### Tasks
- Implement high-frequency ticker animation using requestAnimationFrame
- Format yield in token units
- Add unit test

### Acceptance Criteria
- `Implement Real-Time Accrued Yield Counter with Micro-Animations for Blend Escrows` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Virtualized Scrolling for High-Volume Merchant Order History Tables

- **Estimate:** 1 day
- **Context:** [orders] Render 1,000+ past orders smoothly without DOM bloat using `@tanstack/react-virtual`.

### Data Types & Schemas
```typescript
export interface VirtualTableProps<T> {
  data: T[];
  estimateRowHeight: number;
  renderRow(item: T): React.ReactNode;
}
```

### Tasks
- Implement virtualized row rendering
- Test 60 FPS scrolling performance
- Verify responsive layout

### Acceptance Criteria
- `Implement Virtualized Scrolling for High-Volume Merchant Order History Tables` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Interactive Guided Dispute Wizard with File Dropzone

- **Estimate:** 2 days
- **Context:** [disputes] Guide buyers step-by-step through dispute reason selection, photo evidence drag-and-drop, and resolution preference.

### Data Types & Schemas
```typescript
export interface DisputeFormValues {
  reason: 'item_not_received' | 'damaged' | 'not_as_described';
  description: string;
  photoFiles: File[];
  requestedOutcome: 'full_refund' | 'replacement';
}
```

### Tasks
- Build multi-step stepper component
- Implement file drag-and-drop with thumbnail preview
- Validate form

### Acceptance Criteria
- `Implement Interactive Guided Dispute Wizard with File Dropzone` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Emergency Delegation Kill-Switch Button with Two-Step Confirmation

- **Estimate:** 1 day
- **Context:** [settings] Allow users to instantly revoke all active AI agent spending permissions with a single prominent emergency button.

### Data Types & Schemas
```typescript
export interface KillSwitchModalProps {
  activeDelegationCount: number;
  onConfirmRevokeAll(): Promise<void>;
}
```

### Tasks
- Implement red emergency banner and modal
- Require typing 'REVOKE' to confirm
- Broadcast revocation on-chain

### Acceptance Criteria
- `Implement Emergency Delegation Kill-Switch Button with Two-Step Confirmation` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Merchant Catalog Multi-Faceted Filter Sidebar

- **Estimate:** 2 days
- **Context:** [storefront] Enable buyers to filter merchant products by category, price slider, rating, and stock availability.

### Data Types & Schemas
```typescript
export interface CatalogFilterState {
  categories: string[];
  minPrice?: number;
  maxPrice?: number;
  inStockOnly: boolean;
  minRating?: number;
}
```

### Tasks
- Build interactive faceted filter sidebar
- Sync filters with URL query parameters
- Add responsive drawer for mobile

### Acceptance Criteria
- `Implement Merchant Catalog Multi-Faceted Filter Sidebar` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement WebAuthn Biometric Fast-Checkout Modal for Micro-Purchases

- **Estimate:** 1 day
- **Context:** [checkout] Allow buyers to authorize repeat low-value purchases in <2 seconds using TouchID / FaceID passkeys.

### Data Types & Schemas
```typescript
export interface BiometricCheckoutPromptProps {
  orderAmount: string;
  merchantName: string;
  onSuccess(): void;
}
```

### Tasks
- Trigger WebAuthn prompt upon checkout
- Submit signed assertion to backend
- Show success animation

### Acceptance Criteria
- `Implement WebAuthn Biometric Fast-Checkout Modal for Micro-Purchases` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Step-by-Step Transaction Animation Pipeline (Signing -> Submitting -> Confirmed)

- **Estimate:** 1 day
- **Context:** [ui] Provide visual feedback with animated progress steps and confetti celebration on transaction completion.

### Data Types & Schemas
```typescript
export type TxStepState = 'idle' | 'awaiting_signature' | 'broadcasting' | 'confirmed' | 'failed';
```

### Tasks
- Create animated stepper component
- Handle step transitions seamlessly
- Add celebration particle effect

### Acceptance Criteria
- `Implement Step-by-Step Transaction Animation Pipeline (Signing -> Submitting -> Confirmed)` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Category-Based Budget Allocation Visual Sliders in Settings

- **Estimate:** 2 days
- **Context:** [settings] Allow users to allocate monthly spending budgets across categories with visual circular donut chart visualization.

### Data Types & Schemas
```typescript
export interface CategoryBudgetAllocation {
  category: string;
  monthlyLimitStroops: bigint;
  currentSpentStroops: bigint;
}
```

### Tasks
- Build circular budget allocation chart
- Implement interactive allocation sliders
- Alert when approaching 90% cap

### Acceptance Criteria
- `Implement Category-Based Budget Allocation Visual Sliders in Settings` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Photo Evidence EXIF Metadata Scrubbing Before Dispute Upload

- **Estimate:** 1 day
- **Context:** [disputes] Strip GPS location coordinates and camera serial numbers from evidence photos in the browser before upload.

### Data Types & Schemas
```typescript
export function scrubExifMetadata(file: File): Promise<Blob> {
  // client-side canvas or EXIF scrubbing
}
```

### Tasks
- Render image to canvas to remove EXIF tags
- Maintain original image resolution
- Verify privacy preservation

### Acceptance Criteria
- `Implement Photo Evidence EXIF Metadata Scrubbing Before Dispute Upload` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement In-Chat Product Recommendation Card with 1-Click Purchase

- **Estimate:** 1 day
- **Context:** [agent] Render interactive product cards inside the Buyer Agent chat stream with stock badges and instant checkout trigger.

### Data Types & Schemas
```typescript
export interface InChatProductCardProps {
  productId: string;
  title: string;
  priceStroops: bigint;
  imageUrl: string;
  onBuyNow(productId: string): void;
}
```

### Tasks
- Build chat product card component
- Handle buy-now interaction
- Add loading state

### Acceptance Criteria
- `Implement In-Chat Product Recommendation Card with 1-Click Purchase` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Merchant Store Registration Wizard with Soroban Account Linking

- **Estimate:** 2 days
- **Context:** [merchant] Walk new merchants through setting up store name, payout address, catalog import, and Soroban verification.

### Data Types & Schemas
```typescript
export interface MerchantOnboardingData {
  storeName: string;
  payoutAddress: string;
  contactEmail: string;
  catalogCsvFile?: File;
}
```

### Tasks
- Build onboarding stepper
- Validate payout address on Stellar network
- Submit registration to contract

### Acceptance Criteria
- `Implement Merchant Store Registration Wizard with Soroban Account Linking` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Automated Sales Tax and VAT Breakdown Display in Checkout

- **Estimate:** 1 day
- **Context:** [checkout] Calculate and display estimated regional sales tax or VAT based on delivery postal code before escrow funding.

### Data Types & Schemas
```typescript
export interface TaxBreakdown {
  subtotalStroops: bigint;
  taxRateBps: number;
  taxAmountStroops: bigint;
  totalStroops: bigint;
}
```

### Tasks
- Calculate tax based on postal jurisdiction
- Display itemized breakdown in summary
- Add unit test

### Acceptance Criteria
- `Implement Automated Sales Tax and VAT Breakdown Display in Checkout` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Custom CSV and JSON Expense Report Builder for Corporate Buyers

- **Estimate:** 2 days
- **Context:** [analytics] Allow buyers to select date ranges, categories, and merchants to generate customized downloadable expense reports.

### Data Types & Schemas
```typescript
export interface ExpenseReportFilter {
  startDate: Date;
  endDate: Date;
  categories: string[];
  format: 'csv' | 'json';
}
```

### Tasks
- Build report generator interface
- Generate client-side formatted export
- Test filtering

### Acceptance Criteria
- `Implement Custom CSV and JSON Expense Report Builder for Corporate Buyers` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Real-Time Accrued Platform Fee Estimator in Merchant Dashboard

- **Estimate:** 1 day
- **Context:** [merchant] Display estimated platform fee withholdings and projected net payouts across all pending escrow orders.

### Data Types & Schemas
```typescript
export interface PayoutProjection {
  pendingGrossStroops: bigint;
  estimatedPlatformFees: bigint;
  projectedNetPayout: bigint;
}
```

### Tasks
- Compute projections across active orders
- Render summary card with tooltip explanations
- Add unit test

### Acceptance Criteria
- `Implement Real-Time Accrued Platform Fee Estimator in Merchant Dashboard` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Merchant Dispute Response Drawer with Counter-Evidence Dropzone

- **Estimate:** 2 days
- **Context:** [merchant] Provide merchants with a dedicated drawer to review customer dispute claims and upload tracking receipts.

### Data Types & Schemas
```typescript
export interface DisputeResponseForm {
  disputeId: string;
  merchantStatement: string;
  carrierTrackingUrl?: string;
  receiptFiles: File[];
}
```

### Tasks
- Build response drawer UI
- Handle counter-evidence file upload
- Submit response to API

### Acceptance Criteria
- `Implement Merchant Dispute Response Drawer with Counter-Evidence Dropzone` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Return Shipping Label Generation Modal with Printable Barcode

- **Estimate:** 1 day
- **Context:** [disputes] Generate a printable PDF return shipping label containing carrier barcode when a return dispute is approved.

### Data Types & Schemas
```typescript
export interface ReturnLabelData {
  rmaNumber: string;
  returnAddress: string;
  carrierBarcodeSvg: string;
}
```

### Tasks
- Render printable label template
- Include carrier barcode and RMA number
- Add print trigger button

### Acceptance Criteria
- `Implement Return Shipping Label Generation Modal with Printable Barcode` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Predictive Spend Forecasting Chart for Delegated Autonomous Agents

- **Estimate:** 2 days
- **Context:** [analytics] Render a predictive trendline showing projected monthly spend based on historical agent purchasing frequency.

### Data Types & Schemas
```typescript
export interface SpendForecastPoint {
  date: string;
  actualSpend: number;
  forecastSpend: number;
  confidenceUpper: number;
  confidenceLower: number;
}
```

### Tasks
- Build forecasting chart using Recharts
- Display confidence intervals
- Add toggle for 30/60/90 days

### Acceptance Criteria
- `Implement Predictive Spend Forecasting Chart for Delegated Autonomous Agents` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Live Agent Reasoning Step Trace Visualizer in Chat Drawer

- **Estimate:** 1 day
- **Context:** [agent] Display an expandable step-by-step trace showing the agent's thought process ('Searching catalog...', 'Validating budget...').

### Data Types & Schemas
```typescript
export interface AgentThoughtStep {
  stepId: string;
  description: string;
  status: 'running' | 'completed' | 'failed';
  timestamp: number;
}
```

### Tasks
- Render collapsible thought trace accordion
- Animate active thinking state
- Display tool invocation logs

### Acceptance Criteria
- `Implement Live Agent Reasoning Step Trace Visualizer in Chat Drawer` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Merchant Webhook Delivery Log Viewer with Payload Inspection

- **Estimate:** 1 day
- **Context:** [merchant] Allow merchants to inspect recent webhook delivery attempts, HTTP response codes, and trigger manual retries.

### Data Types & Schemas
```typescript
export interface WebhookDeliveryLog {
  eventId: string;
  endpointUrl: string;
  httpStatus: number;
  deliveredAt: Date;
  requestPayload: string;
  responseBody?: string;
}
```

### Tasks
- Build webhook inspection modal
- Display formatted JSON payloads
- Add 'Retry Webhook' action

### Acceptance Criteria
- `Implement Merchant Webhook Delivery Log Viewer with Payload Inspection` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Voice Input Mic Button for Conversational Buyer Agent Prompts

- **Estimate:** 1 day
- **Context:** [agent] Enable speech-to-text input in the chat drawer using the browser Web Speech API with real-time transcript preview.

### Data Types & Schemas
```typescript
export interface SpeechRecognitionHook {
  isListening: boolean;
  transcript: string;
  startListening(): void;
  stopListening(): void;
}
```

### Tasks
- Integrate Web Speech API
- Render pulsing recording microphone button
- Populate chat input with transcript

### Acceptance Criteria
- `Implement Voice Input Mic Button for Conversational Buyer Agent Prompts` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Agent User Preference Memory Inspector and Editor

- **Estimate:** 1 day
- **Context:** [agent] Allow users to view, edit, or delete long-term preferences stored by their Buyer Agent ('Prefers organic', 'Size M').

### Data Types & Schemas
```typescript
export interface UserPreferenceItem {
  key: string;
  value: string;
  learnedFromOrder?: string;
}
```

### Tasks
- Build preferences management list
- Allow inline editing and deletion
- Sync changes with backend API

### Acceptance Criteria
- `Implement Agent User Preference Memory Inspector and Editor` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Escrow Auto-Release Grace Period Banner with Undo Action

- **Estimate:** 1 day
- **Context:** [escrow] Display a prominent 24-hour countdown banner after delivery scan allowing buyer to extend review window before funds release.

### Data Types & Schemas
```typescript
export interface GracePeriodCountdownProps {
  releaseTimestamp: number;
  onExtendReviewWindow(): Promise<void>;
}
```

### Tasks
- Build countdown banner with ticking timer
- Add 'Need More Time' extension button
- Confirm extension on-chain

### Acceptance Criteria
- `Implement Escrow Auto-Release Grace Period Banner with Undo Action` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Merchant Reputation and Verification Badge Component

- **Estimate:** 1 day
- **Context:** [ui] Render standardized verification badges (Verified Merchant, Top Rated, Fast Shipper) across catalog listings.

### Data Types & Schemas
```typescript
export interface VerificationBadgeProps {
  tier: 'verified' | 'gold' | 'pro';
  reputationScoreBps: number;
  showTooltip?: boolean;
}
```

### Tasks
- Build badge component with SVG icons
- Add accessible hover tooltip explaining criteria
- Test responsiveness

### Acceptance Criteria
- `Implement Merchant Reputation and Verification Badge Component` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Comprehensive End-to-End Playwright Test Suite for Checkout Flows

- **Estimate:** 2 days
- **Context:** [tests] Add automated Playwright browser tests covering wallet connection, product search, chat checkout, and escrow release.

### Data Types & Schemas
```typescript
// Playwright test suite for critical buyer journey
```

### Tasks
- Write E2E test for full checkout lifecycle
- Mock Stellar wallet interactions
- Integrate into CI workflow

### Acceptance Criteria
- `Implement Comprehensive End-to-End Playwright Test Suite for Checkout Flows` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Currency Display Switcher for Global Multi-Currency Storefronts

- **Estimate:** 1 day
- **Context:** [ui] Allow buyers to view estimated item prices in preferred fiat currencies (USD, EUR, GBP, NGN) via live price feeds.

### Data Types & Schemas
```typescript
export type FiatCurrency = 'USD' | 'EUR' | 'GBP' | 'NGN';
export interface FiatConversionProps {
  tokenAmountStroops: bigint;
  selectedFiat: FiatCurrency;
}
```

### Tasks
- Build currency switcher dropdown
- Fetch conversion rates from backend API
- Format prices with proper currency symbols

### Acceptance Criteria
- `Implement Currency Display Switcher for Global Multi-Currency Storefronts` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Accessible Focus Visible Ring and Skip-To-Content Navigation Link

- **Estimate:** 1 day
- **Context:** [a11y] Ensure all interactive buttons, inputs, and links display a high-contrast focus indicator meeting WCAG 2.4.7.

### Data Types & Schemas
```css
.focus-visible-ring:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
```

### Tasks
- Add 'Skip to Main Content' skip-link
- Apply focus-visible styles across design system
- Test with keyboard-only navigation

### Acceptance Criteria
- `Implement Accessible Focus Visible Ring and Skip-To-Content Navigation Link` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Web Push Notifications for Order Shipment and Delivery Status Changes

- **Estimate:** 2 days
- **Context:** [notifications] Allow buyers to opt into browser Web Push notifications to receive immediate alerts when packages are scanned.

### Data Types & Schemas
```typescript
export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  orderIds: string[];
}
```

### Tasks
- Integrate Service Worker push event listener
- Prompt user for notification permissions
- Send test notification

### Acceptance Criteria
- `Implement Web Push Notifications for Order Shipment and Delivery Status Changes` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Merchant KYC Verification Document Uploader with Encryption

- **Estimate:** 2 days
- **Context:** [merchant] Allow merchant applicants to upload encrypted identity documents for tier-2 trading verification.

### Data Types & Schemas
```typescript
export interface KycUploadData {
  documentType: 'passport' | 'id_card' | 'business_license';
  encryptedFileBlob: Blob;
  merchantId: string;
}
```

### Tasks
- Implement file encryption before upload
- Provide upload progress bar
- Handle verification status polling

### Acceptance Criteria
- `Implement Merchant KYC Verification Document Uploader with Encryption` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Mobile Swipe Gesture Actions for Order List Items

- **Estimate:** 1 day
- **Context:** [orders] Enable buyers to swipe left on mobile order cards to reveal quick actions ('Track Shipment', 'Contact Merchant').

### Data Types & Schemas
```typescript
export interface SwipeableCardProps {
  orderId: string;
  onTrack(): void;
  onContact(): void;
}
```

### Tasks
- Integrate Framer Motion touch drag gestures
- Reveal action buttons on swipe
- Add haptic vibration feedback

### Acceptance Criteria
- `Implement Mobile Swipe Gesture Actions for Order List Items` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Interactive Yield Projection Calculator on Escrow Deposit Screen

- **Estimate:** 1 day
- **Context:** [escrow] Show buyers an interactive calculator estimating potential interest earned while funds are held in Blend escrow.

### Data Types & Schemas
```typescript
export interface YieldProjectionCalculation {
  principalAmount: number;
  estimatedHoldingDays: number;
  aprPercent: number;
  projectedEarningsUsd: number;
}
```

### Tasks
- Build projection slider component
- Calculate compound interest dynamically
- Display disclaimer tooltip

### Acceptance Criteria
- `Implement Interactive Yield Projection Calculator on Escrow Deposit Screen` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Live Chat Audio Ping for Incoming Buyer Agent Messages

- **Estimate:** 1 day
- **Context:** [agent] Play a subtle, non-intrusive audio chime when the AI agent completes generating a response or proposal card.

### Data Types & Schemas
```typescript
export interface AudioNotificationOptions {
  soundEnabled: boolean;
  volume: number;
  playChime(): void;
}
```

### Tasks
- Synthesize gentle web audio chime using AudioContext
- Add sound toggle in chat settings
- Respect system reduced-motion/sound

### Acceptance Criteria
- `Implement Live Chat Audio Ping for Incoming Buyer Agent Messages` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Responsive Floating Action Button (FAB) for Instant Agent Access

- **Estimate:** 1 day
- **Context:** [ui] Display a floating action button on mobile screens allowing buyers to launch the AI assistant from any page.

### Data Types & Schemas
```typescript
export interface FabButtonProps {
  unreadProposalsCount: number;
  onClick(): void;
}
```

### Tasks
- Build responsive FAB component
- Animate entrance on scroll
- Show unread proposal badge count

### Acceptance Criteria
- `Implement Responsive Floating Action Button (FAB) for Instant Agent Access` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement One-Click Testnet Friendbot Faucet Trigger from Header

- **Estimate:** 1 day
- **Context:** [wallet] Allow developers on testnet to fund their connected Stellar wallet with 10,000 testnet XLM via Friendbot.

### Data Types & Schemas
```typescript
export interface FriendbotResponse {
  success: boolean;
  fundedAddress: string;
  newBalanceXlm: string;
}
```

### Tasks
- Add 'Fund with Friendbot' button in wallet modal
- Trigger Horizon Friendbot endpoint
- Refresh wallet balance automatically

### Acceptance Criteria
- `Implement One-Click Testnet Friendbot Faucet Trigger from Header` implemented according to technical specification.
- All associated unit and component tests pass.

---

## Implement Automated Lighthouse CI Performance and Accessibility Budget Gate

- **Estimate:** 1 day
- **Context:** [tests] Configure continuous performance budget assertions in CI pipeline ensuring minimum 90+ score across Performance, Accessibility, and Best Practices.

### Data Types & Schemas
```json
{
  "ci": {
    "assert": {
      "assertions": {
        "categories:performance": ["error", {"minScore": 0.9}],
        "categories:accessibility": ["error", {"minScore": 0.95}]
      }
    }
  }
}
```

### Tasks
- Configure Lighthouse CI runner
- Add assertion thresholds
- Integrate into GitHub Actions workflow

### Acceptance Criteria
- `Implement Automated Lighthouse CI Performance and Accessibility Budget Gate` implemented according to technical specification.
- All associated unit and component tests pass.

---

