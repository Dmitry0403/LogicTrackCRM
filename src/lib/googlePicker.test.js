import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGooglePickerLoader } from "./googlePicker";

function fixture() {
  const scripts = [];
  const browser = { document: {
    createElement: () => ({ remove: vi.fn() }),
    head: { appendChild: (script) => scripts.push(script) },
  } };
  const load = createGooglePickerLoader({ getWindow: () => browser, timeoutMs: 20, retryDelayMs: 5 });
  const readyGapi = () => {
    browser.gapi = { load: vi.fn((_name, options) => { browser.google = { picker: {} }; options.callback(); }) };
  };
  return { browser, scripts, load, readyGapi };
}

describe("Google Picker loading recovery", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reuses an already loaded picker", async () => {
    const { browser, scripts, load } = fixture();
    browser.google = { picker: {} };
    await load();
    expect(scripts).toHaveLength(0);
  });

  it("shares one request across clicks and retries the failed script", async () => {
    const { scripts, load, readyGapi } = fixture();
    const first = load();
    expect(load()).toBe(first);
    expect(scripts).toHaveLength(1);
    scripts[0].onerror();
    await vi.advanceTimersByTimeAsync(5);
    expect(scripts[0].remove).toHaveBeenCalledOnce();
    expect(scripts).toHaveLength(2);
    readyGapi();
    scripts[1].onload();
    await first;
    await load();
    expect(scripts).toHaveLength(2);
  });

  it("clears failed promises so the next click can succeed without reload", async () => {
    const { browser, load, readyGapi } = fixture();
    browser.gapi = { load: vi.fn((_name, options) => options.onerror()) };
    const failed = expect(load()).rejects.toMatchObject({ code: "GOOGLE_PICKER_LOAD_FAILED" });
    await vi.runAllTimersAsync();
    await failed;
    expect(browser.gapi.load).toHaveBeenCalledTimes(2);
    readyGapi();
    await load();
    expect(browser.google.picker).toBeDefined();
  });

  it("times out hanging script requests and allows a fresh attempt", async () => {
    const { scripts, load, readyGapi } = fixture();
    const failed = expect(load()).rejects.toMatchObject({ code: "GOOGLE_PICKER_LOAD_FAILED" });
    await vi.runAllTimersAsync();
    await failed;
    expect(scripts).toHaveLength(2);
    expect(scripts.every((script) => script.remove.mock.calls.length === 1)).toBe(true);
    const next = load();
    expect(scripts).toHaveLength(3);
    readyGapi();
    scripts[2].onload();
    await next;
  });

  it("does not leave module loading pending forever", async () => {
    const { browser, load } = fixture();
    browser.gapi = { load: vi.fn() };
    const failed = expect(load()).rejects.toMatchObject({ code: "GOOGLE_PICKER_LOAD_FAILED" });
    await vi.runAllTimersAsync();
    await failed;
    expect(browser.gapi.load).toHaveBeenCalledTimes(2);
  });
});
