import { describe, it, expect } from "vitest";
import type { Event } from "@sentry/nextjs";
import {
  REDACTED_ADDRESS,
  REDACTED_EMAIL,
  REDACTED_STELLAR_SECRET,
  REDACTED_VALUE,
  scrubSentryEvent,
  scrubString,
} from "./scrub-sentry";

const STELLAR_SECRET = "S" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);
const STELLAR_PUBLIC_KEY = "G" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);

function makeEvent(overrides: Record<string, unknown> = {}): Event {
  return overrides as unknown as Event;
}

describe("scrubString (#761)", () => {
  it("redacts a canonical 56-character Stellar secret seed", () => {
    expect(STELLAR_SECRET).toHaveLength(56);
    expect(scrubString(`seed=${STELLAR_SECRET}`)).toBe(`seed=${REDACTED_STELLAR_SECRET}`);
  });

  it("leaves a 56-character Stellar public key untouched", () => {
    expect(STELLAR_PUBLIC_KEY).toHaveLength(56);
    expect(scrubString(`to=${STELLAR_PUBLIC_KEY}`)).toBe(`to=${STELLAR_PUBLIC_KEY}`);
  });

  it("redacts every Stellar secret when several are present", () => {
    expect(scrubString(`${STELLAR_SECRET} and ${STELLAR_SECRET}`)).toBe(
      `${REDACTED_STELLAR_SECRET} and ${REDACTED_STELLAR_SECRET}`
    );
  });

  it("redacts email addresses", () => {
    expect(scrubString("contact alice.smith+wave@example.co.uk now")).toBe(
      `contact ${REDACTED_EMAIL} now`
    );
  });

  it("redacts street addresses, including an apartment unit", () => {
    expect(scrubString("Ship to 123 Main Street Apt 4B today")).toBe(
      `Ship to ${REDACTED_ADDRESS} today`
    );
  });

  it("leaves ordinary diagnostic text unchanged", () => {
    const text = "Failed to load /orders after 3 retries in 1200ms";
    expect(scrubString(text)).toBe(text);
  });
});

describe("scrubSentryEvent (#761)", () => {
  it("redacts secrets and PII in exception values", () => {
    const event = makeEvent({
      exception: {
        values: [{ type: "Error", value: `bad seed ${STELLAR_SECRET} for alice@example.com` }],
      },
    });

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.exception?.values?.[0]?.value).toBe(
      `bad seed ${REDACTED_STELLAR_SECRET} for ${REDACTED_EMAIL}`
    );
  });

  it("redacts variables captured in exception stack frames", () => {
    const event = makeEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "boom",
            stacktrace: { frames: [{ filename: "app.ts", vars: { secretKey: STELLAR_SECRET } }] },
          },
        ],
      },
    });

    const scrubbed = scrubSentryEvent(event);
    const frame = scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0] as
      | { vars?: Record<string, unknown> }
      | undefined;

    expect(frame?.vars?.secretKey).toBe(REDACTED_STELLAR_SECRET);
  });

  it("redacts breadcrumb messages and nested breadcrumb data", () => {
    const event = makeEvent({
      breadcrumbs: [
        { category: "console", message: `login ${STELLAR_SECRET}`, level: "info" },
        {
          category: "fetch",
          message: "shipping",
          data: {
            address: "500 Elm Road",
            contact: "bob@example.com",
            nested: { note: STELLAR_SECRET },
          },
        },
      ],
    });

    const scrubbed = scrubSentryEvent(event);
    const data = scrubbed.breadcrumbs?.[1].data as Record<string, unknown>;

    expect(scrubbed.breadcrumbs?.[0].message).toBe(`login ${REDACTED_STELLAR_SECRET}`);
    expect(data.address).toBe(REDACTED_ADDRESS);
    expect(data.contact).toBe(REDACTED_EMAIL);
    expect((data.nested as Record<string, unknown>).note).toBe(REDACTED_STELLAR_SECRET);
  });

  it("redacts extra values however deeply nested", () => {
    const event = makeEvent({
      extra: {
        payload: { items: [{ note: `key ${STELLAR_SECRET}` }] },
        contact: "carol@example.com",
      },
    });

    const scrubbed = scrubSentryEvent(event);
    const items = (scrubbed.extra?.payload as { items: { note: string }[] }).items;

    expect(items[0].note).toBe(`key ${REDACTED_STELLAR_SECRET}`);
    expect(scrubbed.extra?.contact).toBe(REDACTED_EMAIL);
  });

  it("redacts values stored under credential and payment keys", () => {
    const event = makeEvent({
      extra: { password: "hunter2", cardNumber: "4242424242424242", cvv: "123" },
      request: { data: { password: "hunter2", amount: "10" } },
    });

    const scrubbed = scrubSentryEvent(event);
    const data = (scrubbed.request as { data: Record<string, unknown> }).data;

    expect(scrubbed.extra?.password).toBe(REDACTED_VALUE);
    expect(scrubbed.extra?.cardNumber).toBe(REDACTED_VALUE);
    expect(scrubbed.extra?.cvv).toBe(REDACTED_VALUE);
    expect(data.password).toBe(REDACTED_VALUE);
    expect(data.amount).toBe("10");
  });

  it("redacts user email", () => {
    const event = makeEvent({ user: { id: "u1", email: "eve@example.com" } });
    expect(scrubSentryEvent(event).user?.email).toBe(REDACTED_EMAIL);
  });

  it("drops cookies, auth headers, and storage snapshots", () => {
    const event = makeEvent({
      request: {
        cookies: { session: "abc" },
        headers: { Authorization: "Bearer x", Cookie: "session=abc", "X-Trace": "1" },
        url: `https://app.example.com/send?seed=${STELLAR_SECRET}`,
      },
      extra: { localStorage: { token: "x" }, sessionStorage: { k: "v" }, keep: 1 },
    });

    const scrubbed = scrubSentryEvent(event);
    const request = scrubbed.request as unknown as {
      cookies?: unknown;
      headers: Record<string, unknown>;
      url?: string;
    };

    expect(request.cookies).toBeUndefined();
    expect(request.headers.Authorization).toBeUndefined();
    expect(request.headers.Cookie).toBeUndefined();
    expect(request.headers["X-Trace"]).toBe("1");
    expect(request.url).toBe(`https://app.example.com/send?seed=${REDACTED_STELLAR_SECRET}`);
    expect(scrubbed.extra?.localStorage).toBeUndefined();
    expect(scrubbed.extra?.sessionStorage).toBeUndefined();
    expect(scrubbed.extra?.keep).toBe(1);
  });

  it("does not mutate the input event", () => {
    const event = makeEvent({
      message: `seed ${STELLAR_SECRET}`,
      breadcrumbs: [{ message: "alice@example.com" }],
    });
    const before = JSON.stringify(event);

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed).not.toBe(event);
    expect(JSON.stringify(event)).toBe(before);
    expect(event.message).toBe(`seed ${STELLAR_SECRET}`);
  });

  it("handles circular references without throwing", () => {
    const extra: Record<string, unknown> = { contact: "dave@example.com" };
    extra.self = extra;

    const scrubbed = scrubSentryEvent(makeEvent({ extra }));

    expect(scrubbed.extra?.contact).toBe(REDACTED_EMAIL);
    expect((scrubbed.extra as Record<string, unknown>).self).toBe(scrubbed.extra);
  });
});
