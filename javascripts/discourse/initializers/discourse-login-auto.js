import { withPluginApi } from "discourse/lib/plugin-api";

const LOGIN_PATH_REGEX = /^\/login\/?$/;
const TOPIC_PATH_REGEX = /^\/t\/[^/]+\/\d+(?:\/\d+)?\/?$/;
const AUTO_REDIRECT_MARK = "discourse-login-auto:redirected";

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

function redirectOnce(sourceUrl, targetUrl) {
  const storageKey = `${AUTO_REDIRECT_MARK}:${sourceUrl}`;
  if (window.sessionStorage.getItem(storageKey)) {
    return;
  }

  window.sessionStorage.setItem(storageKey, "1");
  window.location.assign(targetUrl);
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
    withPluginApi("0.8.7", (api) => {
      api.onPageChange(() => {
        handleAutoLogin(api);
      });

      handleAutoLogin(api);
    });
  },
};