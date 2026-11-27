/** Shared data model. The workspace is stored as one JSON document (format version 3). */

export const COLORS = ['blue', 'green', 'orange', 'rose', 'purple'] as const;
export type Color = (typeof COLORS)[number];

export const STATUSES = ['todo', 'doing', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const REPEATS = ['none', 'daily', 'weekly', 'monthly'] as const;
export type Repeat = (typeof REPEATS)[number];

export const BLOCK_TYPES = ['text', 'heading', 'check', 'quote', 'divider'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export type Priority = 'normal' | 'high';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  /** Due date as YYYY-MM-DD, or '' when the task has no deadline. */
  date: string;
  /** Optional time of day (HH:MM) used for reminders. Requires a date. */
  time: string;
  areaId: string;
  projectId: string;
  priority: Priority;
  status: Status;
  done: boolean;
  pinned: boolean;
  completedAt: string | null;
  createdAt: string;
  repeat: Repeat;
  /** Day of month kept for monthly repetition (e.g. 31 stays 31 after February). */
  repeatDay: number;
  nextTaskId: string;
  generatedFrom: string;
  subtasks: Subtask[];
}

export interface Area {
  id: string;
  title: string;
  description: string;
  color: Color;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  color: Color;
  archived: boolean;
  areaId: string;
}

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked: boolean;
}

export interface Page {
  id: string;
  title: string;
  areaId: string;
  projectId: string;
  favorite: boolean;
  updatedAt: string;
  blocks: Block[];
}

/** A saved weekly review, keyed by the Monday (YYYY-MM-DD) of the reviewed week. */
export interface Review {
  wins: string;
  adjust: string;
  /** Up to three task ids chosen as priorities for the following week. */
  priorities: string[];
  completed: number;
  savedAt: string;
}

export interface Workspace {
  version: 3;
  areas: Area[];
  tasks: Task[];
  projects: Project[];
  pages: Page[];
  daily: Record<string, string>;
  scratch: string;
  reviews: Record<string, Review>;
}
