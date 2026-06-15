"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import type {
  LocationId,
  RecommendationStatus,
  Task,
  Note,
  Client,
  Goal,
  Symptom,
} from "@/lib/types";
import { seedTasks } from "@/lib/mock/tasks";
import { seedNotes } from "@/lib/mock/notes";
import { automations as seedAutomations } from "@/lib/mock/automations";
import { recommendationRules as seedRules } from "@/lib/rules";
import { staff } from "@/lib/mock/staff";

export type RoleView = "Provider" | "Coach" | "Operations";

export interface NewLead {
  id: string;
  firstName: string;
  lastName: string;
  locationId: LocationId;
  goals: Goal[];
  symptoms: Symptom[];
  appointmentType: string;
  createdAt: string;
}

interface StoreState {
  // global filters / role
  locationFilter: LocationId | "all";
  setLocationFilter: (l: LocationId | "all") => void;
  role: RoleView;
  setRole: (r: RoleView) => void;
  activeStaffId: string;

  // recommendation status overrides
  recStatus: Record<string, RecommendationStatus>;
  setRecStatus: (recId: string, status: RecommendationStatus) => void;

  // automations enabled overrides
  automationEnabled: Record<string, boolean>;
  toggleAutomation: (id: string) => void;

  // rules enabled overrides
  ruleEnabled: Record<string, boolean>;
  toggleRule: (id: string) => void;

  // favorites (starred clients)
  favorites: Record<string, boolean>;
  toggleFavorite: (clientId: string) => void;

  // tasks
  tasks: Task[];
  addTask: (t: Omit<Task, "id">) => void;
  toggleTask: (id: string) => void;
  setTaskPriority: (id: string, priority: Task["priority"]) => void;

  // notes
  notes: Note[];
  addNote: (n: Omit<Note, "id" | "createdAt">) => void;

  // leads created from the website intake
  leads: NewLead[];
  addLead: (l: Omit<NewLead, "id" | "createdAt">) => NewLead;

  // reset all demo state
  resetDemo: () => void;
}

const StoreContext = createContext<StoreState | null>(null);

let idCounter = 1000;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

// A fixed "now" so the demo is deterministic.
const NOW = "2026-06-12T09:00:00";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [locationFilter, setLocationFilter] = useState<LocationId | "all">("all");
  const [role, setRole] = useState<RoleView>("Provider");
  const [recStatus, setRecStatusState] = useState<Record<string, RecommendationStatus>>({});
  const [automationEnabled, setAutomationEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(seedAutomations.map((a) => [a.id, a.enabled])),
  );
  const [ruleEnabled, setRuleEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(seedRules.map((r) => [r.id, r.enabled])),
  );
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [notes, setNotes] = useState<Note[]>(seedNotes);
  const [leads, setLeads] = useState<NewLead[]>([]);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({
    "c-001": true,
    "c-011": true,
    "c-019": true,
  });

  const activeStaffId = useMemo(() => {
    const match = staff.find((s) =>
      role === "Provider" ? s.canApprove : role === "Coach" ? s.role === "Coach" : s.role === "Operations",
    );
    return match?.id ?? staff[0].id;
  }, [role]);

  const setRecStatus = useCallback((recId: string, status: RecommendationStatus) => {
    setRecStatusState((prev) => ({ ...prev, [recId]: status }));
  }, []);

  const toggleAutomation = useCallback((id: string) => {
    setAutomationEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleRule = useCallback((id: string) => {
    setRuleEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const addTask = useCallback((t: Omit<Task, "id">) => {
    setTasks((prev) => [{ ...t, id: nextId("t") }, ...prev]);
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, []);

  const setTaskPriority = useCallback((id: string, priority: Task["priority"]) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, priority } : t)));
  }, []);

  const toggleFavorite = useCallback((clientId: string) => {
    setFavorites((prev) => ({ ...prev, [clientId]: !prev[clientId] }));
  }, []);

  const addNote = useCallback((n: Omit<Note, "id" | "createdAt">) => {
    setNotes((prev) => [{ ...n, id: nextId("n"), createdAt: NOW }, ...prev]);
  }, []);

  const addLead = useCallback((l: Omit<NewLead, "id" | "createdAt">) => {
    const lead: NewLead = { ...l, id: nextId("lead"), createdAt: NOW };
    setLeads((prev) => [lead, ...prev]);
    return lead;
  }, []);

  // --- Persistence (demo-friendly): restore setup across refreshes ---
  const STORAGE_KEY = "alphaos_state_v1";
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.locationFilter) setLocationFilter(s.locationFilter);
        if (s.role) setRole(s.role);
        if (s.recStatus) setRecStatusState(s.recStatus);
        if (s.automationEnabled) setAutomationEnabled(s.automationEnabled);
        if (s.ruleEnabled) setRuleEnabled(s.ruleEnabled);
        if (s.favorites) setFavorites(s.favorites);
        if (Array.isArray(s.tasks)) setTasks(s.tasks);
        if (Array.isArray(s.notes)) setNotes(s.notes);
      }
    } catch {
      /* ignore */
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ locationFilter, role, recStatus, automationEnabled, ruleEnabled, favorites, tasks, notes }),
      );
    } catch {
      /* ignore */
    }
  }, [locationFilter, role, recStatus, automationEnabled, ruleEnabled, favorites, tasks, notes]);

  const resetDemo = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  const value = useMemo<StoreState>(
    () => ({
      locationFilter,
      setLocationFilter,
      role,
      setRole,
      activeStaffId,
      recStatus,
      setRecStatus,
      automationEnabled,
      toggleAutomation,
      ruleEnabled,
      toggleRule,
      favorites,
      toggleFavorite,
      tasks,
      addTask,
      toggleTask,
      setTaskPriority,
      notes,
      addNote,
      leads,
      addLead,
      resetDemo,
    }),
    [
      locationFilter,
      role,
      activeStaffId,
      recStatus,
      setRecStatus,
      automationEnabled,
      toggleAutomation,
      ruleEnabled,
      toggleRule,
      favorites,
      toggleFavorite,
      tasks,
      addTask,
      toggleTask,
      setTaskPriority,
      notes,
      addNote,
      leads,
      addLead,
      resetDemo,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

/** Helper: filter any record with a locationId by the active location filter. */
export function matchesLocation(
  locationId: LocationId,
  filter: LocationId | "all",
) {
  return filter === "all" || locationId === filter;
}

export function clientMatchesLocation(c: Client, filter: LocationId | "all") {
  return matchesLocation(c.locationId, filter);
}
