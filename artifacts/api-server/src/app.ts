import express, { type Express } from "express";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import session from "express-session";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { UPLOADS_DIR, UPLOADS_URL_PREFIX } from "./lib/uploads";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set");
}

const app: Express = express();
app.set("trust proxy", 1);
const PgStore = connectPgSimple(session);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Uploaded images: public, served before the session middleware (no session lookup per image).
// Names are random UUIDs, so they can be cached for a long time.
app.use(
  UPLOADS_URL_PREFIX,
  express.static(UPLOADS_DIR, {
    index: false,
    fallthrough: false,
    maxAge: "30d",
    immutable: true,
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

  app.use(
  session({
    store: new PgStore({
  conString: process.env.DATABASE_URL,
  createTableIfMissing: true,
}),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use("/api", router);

export default app;
