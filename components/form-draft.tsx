"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RotateCcw } from "lucide-react";

export const draftPrefix = "prime:draft:v1:";
const prefix = draftPrefix;
export const draftLifetime = 8 * 60 * 60 * 1000;
const lifetime = draftLifetime;
type Draft = {
  version: 1;
  updated: number;
  key: string;
  fields: Record<string, string[]>;
  state: Record<string, unknown>;
};
type Store = {
  draft: Draft;
  persist: () => void;
  clear: () => void;
  complete: () => void;
  writeState: (name: string, value: unknown) => void;
  writeFields: (fields: Draft["fields"]) => void;
  setPending: (pending: boolean) => void;
  subscribe: (listener: () => void) => () => void;
  getStatus: () => number;
};
const Scope = createContext("");
export const DraftLocation = createContext("");
export const useDraftScope = () => useContext(Scope);
const Context = createContext<Store | null>(null);
const logoutEvent = "prime:draft-logout";
export function clearFormDrafts() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  } catch { /* Storage can be disabled by browser policy. */ }
}
export function DraftSession({ scope, children }: { scope: string; children: React.ReactNode }) {
  const [loggedOut, setLoggedOut] = useState(false);
  useEffect(() => {
    // Session identity changes on login; never restore another account/session's data.
    try {
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith(prefix) && !key.startsWith(`${prefix}${scope}:`)) sessionStorage.removeItem(key);
    } catch { /* Forms remain usable without storage. */ }
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("prime-draft-logout");
    const invalidate = () => {
      window.dispatchEvent(new Event(logoutEvent));
      clearFormDrafts();
      setLoggedOut(true);
    };
    if (channel) channel.onmessage = invalidate;
    const logout = (event: Event) => {
      if (event.target instanceof HTMLFormElement && event.target.hasAttribute("data-draft-logout")) {
        invalidate();
        channel?.postMessage("logout");
      }
    };
    document.addEventListener("submit", logout, true);
    return () => { document.removeEventListener("submit", logout, true); channel?.close(); };
  }, [scope]);
  return <Scope.Provider value={scope} key={scope}>{loggedOut ? null : children}</Scope.Provider>;
}
export function FormDraft({ id, children }: { id: string; children: React.ReactNode }) {
  const scope = useContext(Scope);
  const storageKey = `${prefix}${scope}:${id}`;
  const [generation, setGeneration] = useState(0);
  const mounted = useSyncExternalStore(subscribeHydration, () => true, () => false);
  if (!mounted) return <div role="status" aria-label="Forma yüklənir" className="min-h-20 animate-pulse bg-white/5" />;
  return <LoadedDraft key={`${storageKey}:${generation}`} storageKey={storageKey} scope={scope}
    discard={() => setGeneration((n) => n + 1)}>{children}</LoadedDraft>;
}
const subscribeHydration = () => () => {};
function LoadedDraft({ storageKey, scope, discard, children }: {
  storageKey: string; scope: string; discard: () => void; children: React.ReactNode;
}) {
  const location = useContext(DraftLocation);
  const sourceLocation = useRef(location);
  useEffect(() => { sourceLocation.current = location; }, [location]);
  const [store] = useState<Store>(() => {
    let draft: Draft = { version: 1, updated: Date.now(), key: crypto.randomUUID(), fields: {}, state: {} };
    try {
      const raw = sessionStorage.getItem(storageKey);
      const parsed = raw && raw.length < 256_000 ? JSON.parse(raw) as Draft : null;
      if (parsed?.version === 1 && parsed.updated > Date.now() - lifetime &&
        parsed.updated <= Date.now() &&
        typeof parsed.key === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.key) &&
        parsed.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields) &&
        parsed.state && typeof parsed.state === "object" && !Array.isArray(parsed.state))
        draft = parsed;
      else sessionStorage.removeItem(storageKey);
    } catch { /* Corrupt/expired drafts are ignored, never submitted automatically. */ }
    let active = true;
    let status = 0;
    const listeners = new Set<() => void>();
    const updateStatus = (next: number) => {
      status = next;
      listeners.forEach((listener) => listener());
    };
    const value: Store = {
      draft,
      persist: () => {
        if (!scope || !active) return;
        draft.updated = Date.now();
        try {
          const raw = JSON.stringify(draft);
          if (raw.length >= 256_000) throw new Error("Draft too large");
          sessionStorage.setItem(storageKey, raw);
          updateStatus(status & ~2);
        } catch { updateStatus(status | 2); }
      },
      clear: () => { try { sessionStorage.removeItem(storageKey); } catch {} },
      complete: () => {
        if (!active) return;
        active = false;
        // A remounted form may already contain a replacement draft for the same workflow.
        try {
          const raw = sessionStorage.getItem(storageKey);
          if (raw && JSON.parse(raw).key !== draft.key) return;
        } catch { /* Storage may be unavailable; the in-memory form still needs clearing. */ }
        value.clear();
        window.dispatchEvent(new CustomEvent("prime:draft-completed", { detail: { href: sourceLocation.current, scope } }));
        discard();
      },
      writeState: (name, state) => { draft.state[name] = state; value.persist(); },
      writeFields: (fields) => { draft.fields = fields; value.persist(); },
      setPending: (pending) => updateStatus(pending ? status | 1 : status & ~1),
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      getStatus: () => status,
    };
    return value;
  });
  const status = useSyncExternalStore(store.subscribe, store.getStatus, store.getStatus);
  useEffect(() => {
    const invalidate = () => store.complete();
    window.addEventListener(logoutEvent, invalidate);
    return () => window.removeEventListener(logoutEvent, invalidate);
  }, [store]);
  return <Context.Provider value={store}>
    <div>
      {children}
      {!!(status & 2) && <p role="alert" className="mt-3 text-sm text-amber-300">Qaralama brauzerdə saxlanılmadı. Məlumatı saxlamadan səhifəni tərk etməyin.</p>}
      <button type="button" disabled={!!(status & 1)} className="btn btn-secondary mt-4" onClick={() => {
        if (!window.confirm("Saxlanılmamış məlumatlar silinsin?")) return;
        store.complete();
      }}><RotateCcw size={16} /> Qaralamanı ləğv et</button>
    </div>
  </Context.Provider>;
}
export const useFormDraft = () => useContext(Context);
export function useDraftState<T>(name: string, initial: T, valid?: (value: unknown) => boolean) {
  const store = useFormDraft();
  const [value, setValue] = useState<T>(() => {
    const saved = store?.draft.state[name];
    const matches = valid ? valid(saved) : typeof saved === typeof initial && (Array.isArray(initial) ? Array.isArray(saved) : true);
    return saved !== undefined && matches ? saved as T : initial;
  });
  const current = useRef(value);
  const update = useCallback((next: React.SetStateAction<T>) => {
    const result = typeof next === "function" ? (next as (old: T) => T)(current.current) : next;
    current.current = result;
    store?.writeState(name, result);
    setValue(result);
  }, [store, name]);
  return [value, update] as const;
}
export function captureDraft(form: HTMLFormElement, store: Store) {
  const fields: Draft["fields"] = { ...store.draft.fields };
  const data = new FormData(form);
  for (const control of Array.from(form.elements)) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) continue;
    const name = control.name;
    if (!name || name.startsWith("$ACTION") || /password|token|secret|idempotency/i.test(name) ||
      control.hasAttribute("data-draft-managed") || control.type === "file" ||
      (control.type === "hidden" && !control.hasAttribute("data-date-value"))) continue;
    fields[name] = data.getAll(name).filter((v): v is string => typeof v === "string");
  }
  store.writeFields(fields);
}
export function restoreDraftFields(form: HTMLFormElement, store: Store) {
  for (const control of Array.from(form.elements)) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) continue;
    if (control.name.startsWith("$ACTION") || /password|token|secret|idempotency/i.test(control.name) ||
      control.hasAttribute("data-draft-managed") ||
      (control.type === "hidden" && !control.hasAttribute("data-date-value")) ||
      ["work_lines", "part_lines"].includes(control.name)) continue;
    const values = store.draft.fields[control.name];
    if (!Array.isArray(values) || values.some((v) => typeof v !== "string")) continue;
    if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type))
      control.checked = values.includes(control.value);
    else if (control.type !== "file") control.value = values[0] ?? "";
  }
  form.dispatchEvent(new Event("prime:draft-restored"));
}
