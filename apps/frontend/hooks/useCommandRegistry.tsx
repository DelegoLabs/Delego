"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

export type CommandGroup = "navigate" | "actions";

/** High-level grouping surfaced in the palette (Issue #2). */
export type CommandPaletteCategory =
  | "navigation"
  | "orders"
  | "merchants"
  | "settings";

/** Display labels for each palette category. */
export const COMMAND_CATEGORY_LABELS: Record<CommandPaletteCategory, string> = {
  navigation: "Navigation",
  orders: "Orders",
  merchants: "Merchants",
  settings: "Settings",
};

/**
 * Palette item contract (Issue #2). `Command` is the ergonomic registration
 * shape; `toCommandPaletteItem` adapts one to the other when a consumer wants
 * the canonical item model (e.g. an external palette surface or tests).
 */
export interface CommandPaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  category: CommandPaletteCategory;
  action: () => void;
  shortcut?: string;
}

export interface Command {
  id: string;
  label: string;
  subtitle?: string;
  icon?: string;
  /** Extra terms matched against the search query alongside the label */
  keywords?: string[];
  group: CommandGroup;
  /** Optional palette category; takes precedence over `group` for display. */
  category?: CommandPaletteCategory;
  /** Optional accelerator hint shown next to the command (e.g. "g o"). */
  shortcut?: string;
  perform: () => void | Promise<void>;
}

/** Adapts a registered `Command` to the canonical `CommandPaletteItem`. */
export function toCommandPaletteItem(command: Command): CommandPaletteItem {
  const category: CommandPaletteCategory =
    command.category ??
    (command.group === "navigate" ? "navigation" : "settings");
  return {
    id: command.id,
    title: command.label,
    subtitle: command.subtitle,
    category,
    action: () => void command.perform(),
    shortcut: command.shortcut,
  };
}

interface CommandRegistryContextValue {
  commands: Command[];
  /** Adds (or replaces, by id) a command. Returns a function to remove it. */
  register: (command: Command) => () => void;
}

const CommandRegistryContext =
  createContext<CommandRegistryContextValue | null>(null);

/**
 * Holds the set of commands the command palette can show. Features register
 * their own commands incrementally via `useRegisterCommands` — nothing needs
 * to be centrally declared here.
 */
export function CommandRegistryProvider({ children }: { children: ReactNode }) {
  const [commandsById, setCommandsById] = useState<Map<string, Command>>(
    () => new Map()
  );

  const register = useCallback((command: Command) => {
    setCommandsById((prev) => {
      const next = new Map(prev);
      next.set(command.id, command);
      return next;
    });
    return () => {
      setCommandsById((prev) => {
        if (!prev.has(command.id)) return prev;
        const next = new Map(prev);
        next.delete(command.id);
        return next;
      });
    };
  }, []);

  const value = useMemo<CommandRegistryContextValue>(
    () => ({ commands: [...commandsById.values()], register }),
    [commandsById, register]
  );

  return (
    <CommandRegistryContext.Provider value={value}>
      {children}
    </CommandRegistryContext.Provider>
  );
}

/** Read the current set of registered commands. */
export function useCommandRegistry(): Command[] {
  const ctx = useContext(CommandRegistryContext);
  if (!ctx) {
    throw new Error(
      "useCommandRegistry must be used within a CommandRegistryProvider"
    );
  }
  return ctx.commands;
}

/**
 * Registers `commands` with the palette for as long as the calling component
 * is mounted. Pass a stable (e.g. useMemo'd) array — a new identity re-runs
 * registration.
 */
export function useRegisterCommands(commands: Command[]): void {
  const ctx = useContext(CommandRegistryContext);
  if (!ctx) {
    throw new Error(
      "useRegisterCommands must be used within a CommandRegistryProvider"
    );
  }
  const { register } = ctx;

  useEffect(() => {
    const unregisters = commands.map((command) => register(command));
    return () => unregisters.forEach((unregister) => unregister());
  }, [commands, register]);
}
