import { createServer } from "./server.js";

const server = await createServer();

await server.listen({ port: 3000, host: "0.0.0.0" });
