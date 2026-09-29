import { createServer } from "node:http";
import app, { sessionMiddleware } from "./app";
import { logger } from "./lib/logger";
import { initSocket } from "./lib/socket";
import { seedDefaultExchangeRates } from "./lib/exchange-rates";
import { checkPaydunyaConfigAtStartup } from "./lib/paydunya";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Pre-fill the fixed EUR rate if missing (idempotent). Not fatal: prices still show in FCFA without it.
// Online ticket payment is disabled (with a clear log line) when PayDunya isn't configured
checkPaydunyaConfigAtStartup();

seedDefaultExchangeRates().catch((err) => logger.error({ err }, "Could not seed default exchange rates"));

// One HTTP server for both the Express API and Socket.io (live trip tracking)
const server = createServer(app);
initSocket(server, sessionMiddleware);

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
