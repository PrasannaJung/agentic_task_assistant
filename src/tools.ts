import { tool } from "langchain";
import { connectDB, Task } from "./db";
import { z } from "zod";

const createTaskTool = tool(
  async (input) => {
    await connectDB();
    await Task.create(input);
    return { taskCreated: 1 };
  },
  {
    name: "CREATE_TASK",
    description: "Creates a new task with the given details.",
    schema: z.object({
      title: z.string().min(1, "Title is required"),
      priority: z.enum(["low", "medium", "high"]),
      dueDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
        message: "Invalid date format",
      }),
      description: z.string().optional(),
    }),
  },
);

const markTaskCompleteTool = tool(
  async (taskId) => {
    await connectDB();
    const task = await Task.findByIdAndUpdate(taskId, { status: "completed" });
    return { taskCompleted: 1 };
  },
  {
    name: "MARK_TASK_COMPLETE",
    description: "Marks the specified task as complete.",
    schema: z.string().describe("The ID of the task to be marked as complete"),
  },
);

export { createTaskTool, markTaskCompleteTool };
