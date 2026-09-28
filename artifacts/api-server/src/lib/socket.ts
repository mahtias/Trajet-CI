import type { Server as HttpServer } from "node:http";
import type { RequestHandler } from "express";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { logger } from "./logger";
import {
  getUserById,
  getTrackingAccess,
  isTripActive,
  getLastLocation,
  saveLocation,
  formatTripLocation,
} from "./trip-tracking";

/** Under /api so it goes through the same proxy as the REST API (Vite dev proxy, Nginx). */
export const SOCKET_PATH = "/api/socket.io";

/** Drivers' pages send every 15–20 s; anything faster is dropped to protect the database. */
const MIN_UPDATE_INTERVAL_MS = 5_000;

const JoinPayload = z.object({ tripId: z.coerce.number().int().positive() });
const LocationPayload = z.object({
  tripId: z.coerce.number().int().positive(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

type Ack = (response: Record<string, unknown>) => void;

function roomFor(tripId: number) {
  return `trip:${tripId}`;
}

function sessionUserId(socket: Socket): number | undefined {
  return (socket.request as any).session?.userId;
}

export function initSocket(server: HttpServer, sessionMiddleware: RequestHandler) {
  const io = new Server(server, {
    path: SOCKET_PATH,
    cors: { origin: true, credentials: true },
  });

  // Share the express-session cookie/session with Socket.io: the user is whoever is logged in over HTTP
  io.engine.use(sessionMiddleware);

  io.use((socket, next) => {
    if (!sessionUserId(socket)) {
      next(new Error("Authentification requise"));
      return;
    }
    next();
  });

  io.on("connection", (socket) => {
    const lastUpdateAt = new Map<number, number>();

    // Re-read the user on every action: role / company / tickets may have changed since the handshake
    const currentUser = async () => {
      const userId = sessionUserId(socket);
      return userId ? await getUserById(userId) : undefined;
    };

    socket.on("trip:join", async (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => {};
      const parsed = JoinPayload.safeParse(payload);
      if (!parsed.success) { reply({ ok: false, error: "tripId invalide" }); return; }
      const { tripId } = parsed.data;

      const user = await currentUser();
      const access = user ? await getTrackingAccess(user, tripId) : null;
      if (!access) {
        reply({ ok: false, error: "Vous n'avez pas de billet payé pour ce voyage" });
        return;
      }

      await socket.join(roomFor(tripId));
      const location = await getLastLocation(tripId);
      reply({ ok: true, role: access, location: location ? formatTripLocation(location) : null });
    });

    socket.on("trip:leave", async (payload: unknown) => {
      const parsed = JoinPayload.safeParse(payload);
      if (parsed.success) await socket.leave(roomFor(parsed.data.tripId));
    });

    socket.on("location:update", async (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => {};
      const parsed = LocationPayload.safeParse(payload);
      if (!parsed.success) { reply({ ok: false, error: "Position invalide" }); return; }
      const { tripId, latitude, longitude } = parsed.data;

      const user = await currentUser();
      if (!user || (await getTrackingAccess(user, tripId)) !== "driver") {
        reply({ ok: false, error: "Ce voyage appartient à une autre compagnie" });
        return;
      }
      if (!(await isTripActive(tripId))) {
        reply({ ok: false, error: "Ce voyage n'est pas actif" });
        return;
      }

      const now = Date.now();
      if (now - (lastUpdateAt.get(tripId) ?? 0) < MIN_UPDATE_INTERVAL_MS) {
        reply({ ok: false, error: "Mises à jour trop fréquentes" });
        return;
      }
      lastUpdateAt.set(tripId, now);

      const location = formatTripLocation(await saveLocation(tripId, latitude, longitude));
      io.to(roomFor(tripId)).emit("location:broadcast", { tripId, ...location });
      reply({ ok: true, location });
    });
  });

  io.engine.on("connection_error", (err: unknown) => logger.warn({ err }, "Socket.io connection error"));

  return io;
}
