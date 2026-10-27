import { createApp } from "./app.js";
const port = Number(process.env.PORT || 3000);
const { app, close } = createApp();
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`Safety server listening on port ${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(() => {
      close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
