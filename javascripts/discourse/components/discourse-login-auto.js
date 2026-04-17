import Component from "@glimmer/component";
import { action } from "@ember/object";

const TARGET_PATH = "/login";
const AUTO_REDIRECT_MARK = "discourse-login-auto:redirected";

function isMobileBrowser() {
  if (typeof window === "undefined") {
    return false;
  }

  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(
    window.navigator?.userAgent || ""
  );
}

export default class DiscourseLoginAutoComponent extends Component {
  get shouldActivate() {
    if (typeof window === "undefined" || !isMobileBrowser()) {
      return false;
    }

    return window.location.pathname === TARGET_PATH;
  }

  @action
  setup() {
    if (!this.shouldActivate || typeof window === "undefined") {
      return;
    }

    const currentUrl = `${window.location.pathname}${window.location.search}`;
    const storageKey = `${AUTO_REDIRECT_MARK}:${currentUrl}`;
    if (window.sessionStorage.getItem(storageKey)) {
      return;
    }

    window.sessionStorage.setItem(storageKey, "1");
    window.location.assign("/auth/oauth2_basic");
  }
}
