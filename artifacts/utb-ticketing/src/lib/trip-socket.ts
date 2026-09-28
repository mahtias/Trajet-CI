import { io, type Socket } from "socket.io-client";

export interface LiveLocation {
  tripId?: number;
  latitude: number;
  longitude: number;
  updatedAt: string;
}

export interface JoinAck {
  ok: boolean;
  role?: "driver" | "passenger";
  location?: LiveLocation | null;
  error?: string;
}

/**
 * Socket.io connection to the API, authenticated by the same session cookie as the REST calls.
 * Served under /api so it goes through the existing /api proxy (Vite in dev, Nginx in prod).
 */
export function createTripSocket(): Socket {
  return io(import.meta.env.VITE_API_URL || undefined, {
    path: "/api/socket.io",
    withCredentials: true,
    transports: ["websocket", "polling"],
  });
}

/** Joins the trip room; call again on every (re)connect since rooms are lost on reconnection. */
export function joinTrip(socket: Socket, tripId: number): Promise<JoinAck> {
  return new Promise((resolve) => {
    socket.timeout(5000).emit("trip:join", { tripId }, (err: Error | null, ack: JoinAck) => {
      resolve(err ? { ok: false, error: "Le serveur ne répond pas" } : ack);
    });
  });
}
