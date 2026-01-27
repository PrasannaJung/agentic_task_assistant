import { AIMessage, HumanMessage, SystemMessage } from "langchain";
import llm from "./llm";
import { AgentState, type AgentStateType } from "./state";
import { createTaskTool, markTaskCompleteTool } from "./tools";
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import prompt from "prompt-sync";

const tools = [createTaskTool, markTaskCompleteTool];

const llmWithTools = llm.bindTools(tools);

const specialWords = {
  info: ["NEED_MORE_INFO", "INSUFFICIENT_DATA", "MORE_DETAILS"],
  complete: ["TASK_COMPLETE", "DONE", "FINISHED"],
};

async function llmCall(state: AgentStateType) {
  const currDate = new Date();

  const currDateInfo = {
    datetime: currDate.toISOString(),
    dayOfThWeek: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][
      currDate.getDay()
    ],
  };
  const SYSTEM_PROMPT = `
        You are an intelligent task management assistant. Based on the given conversation with the user, you will decide whether to create a new task, mark an existing task as complete, or ask for more information if the conversation is related to tasks otherwise just act as a normal conversational agent.
        THE CURRENT DATE INFO IS: ${JSON.stringify(currDateInfo)}

        GUIDELINES:
        1. CONVERSE: If the user says hello or asks non-task questions, be helpful and witty.
        2. INFER DATE: If user says "tomorrow" or "next Friday", calculate the ISO string based on today's date.
        3. DATA COLLECTION: To create a task, you MUST have: Title, Priority (low/medium/high), and Date.
        4. GAPS: If any of those 3 are missing, DO NOT call the tool. Instead, ask the user specifically for the missing info.
        5. DESCRIPTION: When calling the tool, you must generate a description that is exactly 15 words long.
    `;

  const messages = [new SystemMessage(SYSTEM_PROMPT), ...state.messages];
  const response = await llmWithTools.invoke(messages);
  return { messages: [response] };
}

async function shouldCallDb(state: AgentStateType) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage instanceof AIMessage) {
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return "toolCall";
    }
  }
  return "finish";
}

const checkpointer = new MemorySaver();
const threadConfig = {
  configurable: {
    thread_id: 1,
  },
};

const toolNode = new ToolNode(tools);
const workflow = new StateGraph(AgentState)
  .addNode("llmCall", llmCall)
  .addNode("toolCall", toolNode)
  .addEdge(START, "llmCall")
  .addConditionalEdges("llmCall", shouldCallDb, {
    toolCall: "toolCall",
    finish: END,
  });

const agentWorkflow = workflow.compile({ checkpointer });
const promptInput = prompt({ sigint: true });

async function runAgent() {
  while (true) {
    const userInput = promptInput("YOU:");
    if (userInput.toLowerCase() === "exit") {
      console.log("Exiting the agent. Goodbye!");
      break;
    }

    const result = await agentWorkflow.invoke(
      {
        messages: [new HumanMessage(userInput)],
      },
      threadConfig,
    );

    const lastMessage = result.messages[result.messages.length - 1];
    if (lastMessage instanceof AIMessage) {
      console.log("AGENT:", lastMessage.text);
    }
  }
}

export { runAgent };
