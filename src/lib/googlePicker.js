const SCRIPT_URL = "https://apis.google.com/js/api.js";

export function createGooglePickerLoader({
  getWindow = () => typeof window === "undefined" ? null : window,
  timeoutMs = 15000,
  retryDelayMs = 500,
} = {}) {
  let pending = null;

  const loadScript = (browser) => {
    if (typeof browser.gapi?.load === "function") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = browser.document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      const finish = (error) => {
        clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        if (error) { script.remove(); reject(error); }
        else resolve();
      };
      const timer = setTimeout(() => finish(new Error("Google API script timeout")), timeoutMs);
      script.onload = () => finish(typeof browser.gapi?.load === "function" ? null : new Error("Google API script is not ready"));
      script.onerror = () => finish(new Error("Google API script network error"));
      browser.document.head.appendChild(script);
    });
  };

  const loadPicker = (browser) => {
    if (browser.google?.picker) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Google Picker timeout")), timeoutMs);
      const finish = (error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      try {
        browser.gapi.load("picker", {
          callback: () => finish(browser.google?.picker ? null : new Error("Google Picker is not ready")),
          onerror: () => finish(new Error("Google Picker load error")),
          timeout: timeoutMs,
          ontimeout: () => finish(new Error("Google Picker timeout")),
        });
      } catch (error) { finish(error); }
    });
  };

  return () => {
    const browser = getWindow();
    if (!browser) return Promise.reject(new Error("window is not available"));
    if (browser.google?.picker) return Promise.resolve();
    if (pending) return pending;
    pending = (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await loadScript(browser);
          await loadPicker(browser);
          return;
        } catch (error) {
          if (attempt === 1) throw Object.assign(new Error(
            "Не удалось загрузить окно Google Drive. Проверьте соединение и повторите выбор папки — обновлять страницу не нужно.",
          ), { code: "GOOGLE_PICKER_LOAD_FAILED", cause: error });
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    })().finally(() => { pending = null; });
    return pending;
  };
}

export const loadGooglePickerApi = createGooglePickerLoader();
