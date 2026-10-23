"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { canAccessPath, type AppRole } from "@/lib/security";
import { workflowLocation } from "@/lib/workflow-location";
import { DraftLocation, draftLifetime, draftPrefix, useDraftScope } from "@/components/form-draft";

type Position = { href: string; updated: number; scroll: number; details: number[] };
type Locations = Record<string, Position>;
const Navigation = createContext<Locations>({});
const subscribeHydration = () => () => {};
export function WorkflowNavigation({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const scope = useDraftScope();
  const mounted = useSyncExternalStore(subscribeHydration, () => true, () => false);
  return mounted && scope ? <LoadedNavigation key={scope} scope={scope} role={role}>{children}</LoadedNavigation> : children;
}
function LoadedNavigation({ scope, role, children }: { scope: string; role: AppRole; children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const href = workflowLocation(`${pathname}${search ? `?${search}` : ""}`)?.href;
  const [store] = useState(() => {
    const key = `${draftPrefix}${scope}:navigation`;
    let positions: Locations = {};
    try {
      const raw = sessionStorage.getItem(key);
      const parsed = raw && raw.length < 40000 ? JSON.parse(raw) as Locations : {};
      for (const [module, position] of Object.entries(parsed)) {
        const location = typeof position?.href === "string" ? workflowLocation(position.href) : null;
        if (location?.module === module && location.href === position.href && canAccessPath(role, position.href.split("?")[0]) &&
          position.updated <= Date.now() && position.updated > Date.now() - draftLifetime &&
          Number.isFinite(position.scroll) && position.scroll >= 0 && position.scroll <= 1_000_000 &&
          Array.isArray(position.details) && position.details.length < 200 && position.details.every((n) => Number.isInteger(n) && n >= 0)) positions[module] = position;
      }
    } catch { /* Navigation remains usable without session storage. */ }
    let active = true;
    const listeners = new Set<() => void>();
    return {
      snapshot: () => positions,
      subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
      save: (module: string, position: Position) => {
        if (!active) return;
        positions = { ...positions, [module]: position };
        try { sessionStorage.setItem(key, JSON.stringify(positions)); } catch {}
        listeners.forEach((fn) => fn());
      },
      stop: () => { active = false; positions = {}; try { sessionStorage.removeItem(key); } catch {} listeners.forEach((fn) => fn()); },
      expire: () => {
        const fresh = Object.fromEntries(Object.entries(positions).filter(([, p]) => p.updated > Date.now() - draftLifetime));
        if (Object.keys(fresh).length === Object.keys(positions).length) return;
        positions = fresh;
        if (active) { try { sessionStorage.setItem(key, JSON.stringify(positions)); } catch {} }
        listeners.forEach((fn) => fn());
      },
    };
  });
  const positions = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  useEffect(() => {
    const timer = window.setInterval(store.expire, 60_000);
    return () => window.clearInterval(timer);
  }, [store]);
  useEffect(() => {
    if (!href) return;
    const location = workflowLocation(href)!;
    const previous = store.snapshot()[location.module];
    let position: Position = previous?.href === href && previous.updated > Date.now() - draftLifetime
      ? previous : { href, updated: Date.now(), scroll: 0, details: [] };
    let completed = false;
    const details = () => Array.from(document.querySelectorAll<HTMLDetailsElement>(".app-content details"));
    const remember = () => {
      if (completed) return;
      position = { href, updated: Date.now(), scroll: window.scrollY, details: details().flatMap((el, i) => el.open ? [i] : []) };
      store.save(location.module, position);
    };
    store.save(location.module, position);
    const frame = requestAnimationFrame(() => {
      details().forEach((el, i) => { el.open = position.details.includes(i); });
      window.scrollTo({ top: position.scroll, behavior: "instant" });
    });
    const complete = (event: Event) => {
      const detail = (event as CustomEvent<{ href: string; scope: string }>).detail;
      if (detail?.scope !== scope) return;
      const source = workflowLocation(detail.href);
      if (!source || store.snapshot()[source.module]?.href !== source.href) return;
      if (source.href === href) completed = true;
      // A cleared form must not resurrect its old edit route on the next sidebar visit.
      store.save(source.module, { href: source.module, updated: Date.now(), scroll: 0, details: [] });
    };
    const edit = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".app-content")) {
        completed = false;
        remember();
      }
    };
    document.addEventListener("input", edit);
    document.addEventListener("change", edit);
    document.addEventListener("toggle", remember, true);
    window.addEventListener("scroll", remember, { passive: true });
    window.addEventListener("pagehide", remember);
    window.addEventListener("prime:draft-completed", complete);
    window.addEventListener("prime:draft-logout", store.stop);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("input", edit);
      document.removeEventListener("change", edit);
      document.removeEventListener("toggle", remember, true);
      window.removeEventListener("scroll", remember);
      window.removeEventListener("pagehide", remember);
      window.removeEventListener("prime:draft-completed", complete);
      window.removeEventListener("prime:draft-logout", store.stop);
    };
  }, [href, scope, store]);
  return <Navigation.Provider value={positions}><DraftLocation.Provider value={href ?? ""}>{children}</DraftLocation.Provider></Navigation.Provider>;
}
export function useModuleHref(module: string) {
  const positions = useContext(Navigation);
  const position = positions[module];
  return position?.href ?? module;
}
