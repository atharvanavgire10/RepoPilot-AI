import { useEffect, useState } from "react";
import { fetchTasks, createTask } from "./api";

export function TaskList({ token }: { token: string }) {
  const [tasks, setTasks] = useState<{ id: number; title: string; done: boolean }[]>([]);

  useEffect(() => {
    fetchTasks(token).then(setTasks).catch(console.error);
  }, [token]);

  async function onAdd(title: string) {
    const task = await createTask(token, title);
    setTasks((t) => [task, ...t]);
  }

  return (
    <div>
      <h2>Tasks</h2>
      <button onClick={() => onAdd("New task")}>Add task</button>
      <ul>
        {tasks.map((t) => (
          <li key={t.id}>{t.title}</li>
        ))}
      </ul>
    </div>
  );
}
