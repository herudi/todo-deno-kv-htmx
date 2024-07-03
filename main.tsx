import "./tailwind.ts";

import nhttp, { Handler } from "@nhttp/nhttp";
import { FC, Helmet, htmx, renderToHtml, useScript } from "@nhttp/nhttp/jsx";
import serveStatic from "@nhttp/nhttp/serve-static";
import { ulid } from "@std/ulid";

interface ITodo {
  id: string;
  text: string;
}
type Action = Record<string, string>;

interface ITodoForm {
  todo?: ITodo;
  action: Action;
  btnText: string;
}

const TodoForm: FC<ITodoForm> = (
  { todo, action, btnText },
) => {
  return (
    <form
      id="todo-form"
      autoComplete="off"
      {...action}
    >
      <div class="flex mb-4">
        <input
          id="todo-text"
          type="text"
          name="text"
          class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 mr-2"
          placeholder="Add new task"
          value={todo?.text ?? ""}
          required
        />
        <button
          type="submit"
          class="rounded-md bg-indigo-600 px-6 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {btnText}
        </button>
        <button
          style={{ display: "none" }}
          id="reset-form"
          hx-get="/todo/reset-form"
          hx-swap="outerHTML"
          hx-target="#todo-form"
        >
        </button>
      </div>
    </form>
  );
};

const TodoItem: FC<ITodo> = ({ id, text }) => {
  const todoId = `todo${id}`;
  return (
    <div class="m-2" id={todoId}>
      <label class="flex items-center">
        <input type="checkbox" class="mr-2" />
        <span>{text}</span>
      </label>
      <div>
        <button
          hx-delete={`/todo/${id}`}
          hx-swap="delete"
          hx-target={`#${todoId}`}
          hx-confirm="Are you sure ?"
          class="text-red-500 hover:text-red-700 mr-2 delete-btn"
        >
          Delete
        </button>
        <button
          hx-get={`/todo/${id}`}
          hx-target="#todo-form"
          hx-swap="outerHTML"
          class="text-blue-500 hover:text-blue-700 edit-btn"
        >
          Edit
        </button>
      </div>
      <hr />
    </div>
  );
};

const Todo: FC<{ todos: ITodo[] }> = ({ todos }) => {
  useScript(() => {
    const focus = () => {
      const input = document.getElementById("todo-text");
      if (input) input.focus();
    };
    focus();
    document.addEventListener("requestFocus", () => {
      focus();
    });
    document.addEventListener("resetForm", () => {
      const btn = document.getElementById("reset-form");
      if (btn) btn.click();
      focus();
    });
  });
  const action = {
    "hx-post": "/todo",
    "hx-on--after-request": "this.reset()",
    "hx-swap": "afterbegin",
    "hx-target": "#todo-list",
  };
  return (
    <div class="container mx-auto my-10" id="todo">
      <h1 class="text-center text-3xl font-semibold mb-4">
        To Do List
      </h1>
      <div class="md:w-1/2 mx-auto">
        <div class="bg-white shadow-md rounded-lg p-6">
          <TodoForm
            action={action}
            btnText="Add"
          />
          <ul id="todo-list">
            {todos.map((todo) => <TodoItem {...todo} />)}
          </ul>
        </div>
      </div>
    </div>
  );
};

// open Deno.Kv
const kv = await Deno.openKv();

// findAll Todos
const findAll = async () => {
  const entries = kv.list<ITodo>({ prefix: ["todo"] }, {
    limit: 30,
    reverse: true,
  });
  const todos = [] as ITodo[];
  for await (const entry of entries) {
    todos.push(entry.value);
  }
  return todos;
};

// HX-Trigger requestFocus middleware
const requestFocus: Handler = (rev, next) => {
  rev.response.setHeader("HX-Trigger-After-Swap", "requestFocus");
  return next();
};

// HX-Trigger resetForm middleware
const resetForm: Handler = (rev, next) => {
  rev.response.setHeader("HX-Trigger-After-Swap", "resetForm");
  return next();
};

const app = nhttp();

app.use("/assets", serveStatic("public", { etag: true }));

app.engine(renderToHtml).use(htmx());

// get all todos
app.get("/", async () => {
  const todos = await findAll();
  return (
    <>
      <Helmet>
        <link rel="stylesheet" href="/assets/css/style.css" />
        <body class="bg-gray-100" />
      </Helmet>
      <Todo todos={todos} />
    </>
  );
});

// add new Todo
app.post("/todo", requestFocus, async (rev) => {
  const todo = { id: ulid(), ...rev.body } as ITodo;
  const res = await kv.set(["todo", todo.id], todo);
  if (!res.ok) {
    throw new TypeError("Error set kv");
  }
  return <TodoItem {...todo} />;
});

// reset form
app.get("/todo/reset-form", () => {
  return (
    <TodoForm
      btnText="Add"
      action={{
        "hx-post": "/todo",
        "hx-on--after-request": "this.reset()",
        "hx-swap": "afterbegin",
        "hx-target": "#todo-list",
      }}
    />
  );
});

// Click edit todo
app.get("/todo/:id", requestFocus, async (rev) => {
  const { id } = rev.params;
  const res = await kv.get<ITodo>(["todo", id]);
  const todo = res.value ?? {} as ITodo;
  const action = {
    "hx-put": "/todo/" + id,
    "hx-swap": "outerHTML",
    "hx-target": "#todo" + id,
  };
  return (
    <TodoForm
      btnText="Update"
      todo={todo}
      action={action}
    />
  );
});

// Update todo
app.put("/todo/:id", resetForm, async (rev) => {
  const { id } = rev.params;
  const todo = rev.body as ITodo;
  const { key, value } = await kv.get<ITodo>(["todo", id]);
  if (value) {
    todo.id = id;
    const res = await kv.set(key, todo);
    if (!res.ok) {
      throw new TypeError("Error set kv");
    }
  }
  return <TodoItem {...todo} />;
});

// Delete todo
app.delete("/todo/:id", resetForm, async (rev) => {
  const { id } = rev.params;
  const todo = await kv.get<ITodo>(["todo", id]);
  if (todo.value) {
    await kv.delete(todo.key);
  }
  return null;
});

app.listen(8080);
