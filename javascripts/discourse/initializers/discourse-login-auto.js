import { withPluginApi } from "discourse/lib/plugin-api";

const LOGIN_PATH_REGEX = /^\/login\/?$/;
const TOPIC_PATH_REGEX = /^\/t\/[^/]+\/\d+(?:\/\d+)?\/?$/;
const AUTO_REDIRECT_MARK = "discourse-login-auto:redirected";
const AUTO_REDIRECT_TTL_MS = 30 * 1000;

function isMobileBrowser() {
  if (typeof window === "undefined") {
    return false;
  }

  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(
    window.navigator?.userAgent || ""
  );
}

function getCurrentRelativeUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash || ""}`;
}

function shouldSkipRedirect(storageKey) {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw);
    const ts = Number(parsed?.ts || 0);
    if (!ts || Date.now() - ts > AUTO_REDIRECT_TTL_MS) {
      window.sessionStorage.removeItem(storageKey);
      return false;
    }
    return true;
  } catch (_e) {
    window.sessionStorage.removeItem(storageKey);
    return false;
  }
}

function markRedirect(storageKey) {
  window.sessionStorage.setItem(storageKey, JSON.stringify({ ts: Date.now() }));
}

function redirectOnce(sourceUrl, targetUrl, useReplace = false) {
  const storageKey = `${AUTO_REDIRECT_MARK}:${sourceUrl}`;
  if (shouldSkipRedirect(storageKey)) {
    return;
  }

  markRedirect(storageKey);
  if (useReplace) {
    window.location.replace(targetUrl);
    return;
  }
  window.location.assign(targetUrl);
}

function fastPathLoginRedirect() {
  if (typeof window === "undefined" || !isMobileBrowser()) {
    return false;
  }

  if (!LOGIN_PATH_REGEX.test(window.location.pathname)) {
    return false;
  }

  const sourceUrl = getCurrentRelativeUrl();
  redirectOnce(sourceUrl, "/auth/oauth2_basic", true);
  return true;
}

function handleAutoLogin(api) {
  if (typeof window === "undefined" || !isMobileBrowser()) {
    return;
  }

  if (api.getCurrentUser()) {
    return;
  }

  const sourceUrl = getCurrentRelativeUrl();
  const { pathname } = window.location;

  // 帖子详情页未登录：先带 redirect 去 /login，再由 /login 自动拉起 OAuth。
  if (TOPIC_PATH_REGEX.test(pathname)) {
    const loginUrl = `/login?redirect=${encodeURIComponent(sourceUrl)}`;
    redirectOnce(sourceUrl, loginUrl);
    return;
  }

  // 登录页未登录：直接拉起 OAuth。
  if (LOGIN_PATH_REGEX.test(pathname)) {
    redirectOnce(sourceUrl, "/auth/oauth2_basic");
  }
}

export default {
  name: "discourse-login-auto",

  initialize() {
    // Fast-path: mobile login page should jump to OAuth as early as possible.
    if (fastPathLoginRedirect()) {
      return;
    }

    withPluginApi("0.8.7", (api) => {
      api.onPageChange(() => {
        handleAutoLogin(api);
      });

      handleAutoLogin(api);
    });
  },
};