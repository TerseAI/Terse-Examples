/** Two routes, no router library: "/" lists documents and "/d/<id>" opens one. */
import { useSyncExternalStore } from "react";

export type Route = { page: "home" } | { page: "doc"; docId: string };

function parse(pathname: string): Route {
  const match = /^\/d\/([a-zA-Z0-9_-]{1,64})\/?$/.exec(pathname);
  return match ? { page: "doc", docId: match[1]! } : { page: "home" };
}

const subscribe = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
};

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => location.pathname);
  return parse(pathname);
}

export function navigate(path: string) {
  if (location.pathname === path) return;
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export const docPath = (docId: string) => `/d/${encodeURIComponent(docId)}`;
