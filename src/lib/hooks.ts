"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, type DocumentReference, type Query } from "firebase/firestore";
import { db } from "./firebase";

interface State<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/**
 * Realtime query. Pass `null` to skip (e.g. while waiting for auth).
 * `key` must change whenever the query changes (queries aren't comparable).
 */
export function useQueryData<T extends { id: string }>(q: Query | null, key: string): State<T[]> {
  const [state, setState] = useState<State<T[]>>({ data: [], loading: !!q, error: null });

  useEffect(() => {
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), loading: false, error: null }),
      (error) => {
        console.error(`[useQueryData:${key}]`, error);
        setState({ data: [], loading: false, error });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

/** Realtime single document by path. Pass `null` to skip. */
export function useDocData<T>(path: string | null): State<(T & { id: string }) | null> {
  const [state, setState] = useState<State<(T & { id: string }) | null>>({ data: null, loading: !!path, error: null });

  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const ref = doc(db, path) as DocumentReference;
    return onSnapshot(
      ref,
      (snap) =>
        setState({ data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T & { id: string }) : null, loading: false, error: null }),
      (error) => {
        console.error(`[useDocData:${path}]`, error);
        setState({ data: null, loading: false, error });
      },
    );
  }, [path]);

  return state;
}

/** Persisted state in localStorage (per-device conveniences only). */
export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* storage unavailable */
    }
    setReady(true);
  }, [key]);

  const set = (v: T) => {
    setValue(v);
    try {
      window.localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  };

  return [value, set, ready];
}
