import { AIMessage, HumanMessage, SystemMessage } from "langchain";
import llm from "./llm";
import { AgentState, type AgentStateType } from "./state";
import { createTaskTool, markTaskCompleteTool } from "./tools";
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import prompt from "prompt-sync";
import z from "zod";

const tools = [createTaskTool, markTaskCompleteTool];

const llmWithTools = llm.bindTools(tools);

const specialWords = {
  info: ["NEED_MORE_INFO", "INSUFFICIENT_DATA", "MORE_DETAILS"],
  complete: ["TASK_COMPLETE", "DONE", "FINISHED"],
};

const intentOutput = z.object({
  intent: z.enum(["task_management", "general_chat"]),
});

const llmWithIntentInfo = llm.withStructuredOutput(intentOutput);

async function classifyIntent(state: AgentStateType) {
  const lastMessage = state.messages[state.messages.length - 1];

  const messages = [
    new SystemMessage("Classify the intent of the user's last message."),
    lastMessage as HumanMessage,
  ];

  const response = await llmWithIntentInfo.invoke(messages);
  return { intent: response.intent };
}

async function routeByIntent(state: AgentStateType) {
  const intent = state.intent;

  switch (intent) {
    case "general_chat":
      return "chatAgent";
    case "task_management":
      return "taskAgent";
    default:
      return "finish";
  }
}

async function chatAgent(state: AgentStateType) {
  const SYSTEM_PROMPT = `
    You are a friendly and intelligent assistant. Engage in casual conversation with the user and provide helpful responses. Be logical and witty.`;

  const chatHistory = [new SystemMessage(SYSTEM_PROMPT), ...state.messages];

  const response = await llm.invoke(chatHistory);
  return { messages: [response] };
}

const TaskIntentOutput = z.object({
  intent: z.enum(["create_task", "complete_task", "update_task", "unknown"]),
});
async function taskIntentClassifier(state: AgentStateType) {
  const SYSTEM_PROMPT = `
    You are an intent classifier for task management. Based on the user's last message, classify the intent into one of the following categories: create_task, complete_task, update_task, unknown.
    `;
}

async function taskAgent(state: AgentStateType) {
  const currDate = new Date();

  const currDateInfo = {
    datetime: currDate.toISOString(),
    dayOfTheWeek: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][
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

const TaskReviewOutput = z.object({
  isValid: z
    .boolean()
    .describe("Whether the task details are sufficient to proceed"),
  extractedFields: z.object({
    title: z.string().optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    dueDate: z.string().optional(),
    description: z.string().optional(),
  }),
  missingFields: z.array(z.string()).describe("List of missing fields"),
});

async function taskReviewer(state: AgentStateType) {
  const SYSTEM_PROMPT = `
      You are a meticulous task reviewer. Review the task details that can be inferred based on the conversation and ensure all necessary information is present before proceeding.
      For the details that can be inferred, extract and return them. If any required details are missing, list them out clearly.
    `;

  const llmTaskReviewer = llm.withStructuredOutput(TaskReviewOutput);
  const response = await llmTaskReviewer.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    ...state.messages,
  ]);

  return {
    taskDraft: response.extractedFields,
  };
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
  .addNode("intentClassifier", classifyIntent)
  .addNode("chatAgent", chatAgent)
  .addNode("taskAgent", taskAgent)
  .addNode("toolCall", toolNode)
  .addEdge(START, "intentClassifier")
  .addConditionalEdges("intentClassifier", routeByIntent, {
    chatAgent: "chatAgent",
    taskAgent: "taskAgent",
    finish: END,
  })
  .addConditionalEdges("taskAgent", shouldCallDb, {
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
