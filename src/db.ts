import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  priority: { type: String, enum: ["low", "medium", "high"], required: true },
  dueDate: { type: Date, required: true },
  description: { type: String }, // this is going to be created by the LLM
  status: { type: String, default: "pending", enum: ["pending", "completed"] },
});

export const Task = mongoose.model("Task", TaskSchema);

export async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;
  await mongoose.connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/agentic_tasks",
  );
  console.log("MongoDB Connected");
}
