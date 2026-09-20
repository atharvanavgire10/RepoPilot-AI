import { describe, it, expect } from "vitest";
import { detectApiRoutes } from "../src/services/analyzer.js";

function file(path: string, content: string) {
  return { path, language: "Other", size: content.length, lineCount: content.split("\n").length, content } as never;
}

describe("go route detection", () => {
  it("detects gin-style routes", () => {
    const routes = detectApiRoutes([
      file("main.go", 'package main\nr := gin.Default()\nr.GET("/api/health", h)\nr.POST("/api/tasks", create)\n'),
    ]);
    expect(routes).toMatchObject([
      { method: "GET", path: "/api/health", file: "main.go", line: 3 },
      { method: "POST", path: "/api/tasks", file: "main.go", line: 4 },
    ]);
  });
  it("detects net/http HandleFunc as ANY", () => {
    const routes = detectApiRoutes([file("server.go", 'mux.HandleFunc("/api/items", itemsHandler)\n')]);
    expect(routes).toMatchObject([{ method: "ANY", path: "/api/items" }]);
  });
  it("ignores non-go files", () => {
    expect(detectApiRoutes([file("app.js", 'r.GET("/api/x", h)\n')])).toEqual([]);
  });
});

describe("rust route detection", () => {
  it("detects axum routes", () => {
    const routes = detectApiRoutes([
      file("main.rs", 'let app = Router::new().route("/api/tasks", get(list_tasks).post(create_task));\n'),
    ]);
    expect(routes).toMatchObject([{ method: "GET", path: "/api/tasks", file: "main.rs" }]);
  });
  it("detects actix attributes", () => {
    const routes = detectApiRoutes([file("api.rs", '#[post("/api/submit")]\nasync fn submit() {}\n')]);
    expect(routes).toMatchObject([{ method: "POST", path: "/api/submit" }]);
  });
});

describe("django route detection", () => {
  it("detects path() entries with normalized slash", () => {
    const routes = detectApiRoutes([
      file("urls.py", 'urlpatterns = [\n    path("admin/", admin.site.urls),\n    path("api/tasks/", views.tasks),\n]\n'),
    ]);
    expect(routes.map((r) => r.path)).toEqual(["/admin/", "/api/tasks/"]);
    expect(routes[0].method).toBe("ANY");
  });
});
