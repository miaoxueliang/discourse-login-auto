import { withPluginApi } from "discourse/lib/plugin-api";

const LOGIN_PATH_REGEX = /^\/login\/?$/;
const TOPIC_PATH_REGEX = /^\/t\/[^/]+\/\d+(?:\/\d+)?\/?$/;
const AUTO_REDIRECT_MARK = "discourse-login-auto:redirected";
const AUTO_REDIRECT_TTL_MS = 30 * 1000;
const RETURN_TOPIC_KEY = "discourse-login-auto:return-topic";
const RETURN_TOPIC_TTL_MS = 10 * 60 * 1000;

function normalizePath(url) {
  try {
    const path = String(url || "").split("?")[0].split("#")[0];
    if (!path) {
      return "/";
    }
    return path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
  } catch (_e) {
    return "/";
  }
}

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

function parseRedirectQuery() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const redirect = params.get("redirect");
    return redirect || "";
  } catch (_e) {
    return "";
  }
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

function saveReturnTopic(url) {
  if (!url || !TOPIC_PATH_REGEX.test(url.split("?")[0])) {
    return;
  }
  window.sessionStorage.setItem(
    RETURN_TOPIC_KEY,
    JSON.stringify({ url, ts: Date.now() })
  );
}

function getReturnTopic() {
  try {
    const raw = window.sessionStorage.getItem(RETURN_TOPIC_KEY);
    if (!raw) {
      return "";
    }
    const parsed = JSON.parse(raw);
    const ts = Number(parsed?.ts || 0);
    const url = String(parsed?.url || "");
    if (!ts || !url || Date.now() - ts > RETURN_TOPIC_TTL_MS) {
      window.sessionStorage.removeItem(RETURN_TOPIC_KEY);
      return "";
    }
    return url;
  } catch (_e) {
    window.sessionStorage.removeItem(RETURN_TOPIC_KEY);
    return "";
  }
}

function clearReturnTopic() {
  window.sessionStorage.removeItem(RETURN_TOPIC_KEY);
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

  const currentPath = window.location.pathname;
  if (!LOGIN_PATH_REGEX.test(currentPath) && !TOPIC_PATH_REGEX.test(currentPath)) {
    return false;
  }

  const sourceUrl = getCurrentRelativeUrl();

  // 主题页直跳 OAuth，减少一次 topic -> login 跳转。
  if (TOPIC_PATH_REGEX.test(currentPath)) {
    saveReturnTopic(sourceUrl);
    redirectOnce(sourceUrl, "/auth/oauth2_basic", true);
    return true;
  }

  // 兼容 /login?redirect=/t/.. 场景，提前记录原帖地址。
  const redirectInQuery = parseRedirectQuery();
  if (redirectInQuery) {
    saveReturnTopic(redirectInQuery);
  }

  redirectOnce(sourceUrl, "/auth/oauth2_basic", true);
  return true;
}

function handleAutoLogin(api) {
  if (typeof window === "undefined" || !isMobileBrowser()) {
    return;
  }

  if (api.getCurrentUser()) {
    const returnTopic = getReturnTopic();
    const currentPath = normalizePath(getCurrentRelativeUrl());
    const returnPath = normalizePath(returnTopic);
    if (returnTopic && returnPath !== currentPath) {
      clearReturnTopic();
      window.location.replace(returnTopic);
      return;
    }
    if (returnTopic && returnPath === currentPath) {
      clearReturnTopic();
    }
    return;
  }

  const sourceUrl = getCurrentRelativeUrl();
  const { pathname } = window.location;

  // 帖子详情页未登录：直接拉起 OAuth，减少一跳。
  if (TOPIC_PATH_REGEX.test(pathname)) {
    saveReturnTopic(sourceUrl);
    redirectOnce(sourceUrl, "/auth/oauth2_basic");
    return;
  }

  // 登录页未登录：直接拉起 OAuth；有 redirect 参数时记录原帖。
  if (LOGIN_PATH_REGEX.test(pathname)) {
    const redirectInQuery = parseRedirectQuery();
    if (redirectInQuery) {
      saveReturnTopic(redirectInQuery);
    }
    redirectOnce(sourceUrl, "/auth/oauth2_basic");
  }
}

export default {
  name: "discourse-login-auto",

  initialize() {
    // 已登录时优先执行回原帖兜底，不等待路由事件。
    if (typeof window !== "undefined") {
      const html = window.document?.documentElement;
      const isLoggedIn = !!(html && html.classList.contains("logged-in"));
      if (isLoggedIn) {
        const returnTopic = getReturnTopic();
        if (returnTopic && returnTopic !== getCurrentRelativeUrl()) {
          clearReturnTopic();
          window.location.replace(returnTopic);
          return;
        }
      }
    }

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