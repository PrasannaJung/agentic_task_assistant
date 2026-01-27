import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "langchain";

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => prev.concat(next),
  }),
});
export type AgentStateType = typeof AgentState.State;
