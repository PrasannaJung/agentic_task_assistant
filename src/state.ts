import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "langchain";

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => prev.concat(next),
  }),

  intent: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  taskDraft: Annotation<{
    title?: string;
    priority?: "low" | "medium" | "high";
    dueDate?: string;
    description?: string;
  }>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),
});

export type AgentStateType = typeof AgentState.State;
