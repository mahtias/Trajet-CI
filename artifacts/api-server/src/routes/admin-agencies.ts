import { Router, type IRouter } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  db, agenciesTable, hotelsTable, hotelBookingsTable,
  tourismSpotsTable, tourismBookingsTable, vehiclesTable, vehicleBookingsTable,
} from "@workspace/db";
import {
  GetAdminAgenciesQueryParams,
  CreateAgencyBody,
  UpdateAgencyParams,
  UpdateAgencyBody,
  DeleteAgencyParams,
  GetAdminTourismSpotsQueryParams,
  CreateTourismSpotBody,
  UpdateTourismSpotParams,
  UpdateTourismSpotBody,
  DeleteTourismSpotParams,
  GetAdminVehiclesQueryParams,
  CreateVehicleBody,
  UpdateVehicleParams,
  UpdateVehicleBody,
  DeleteVehicleParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/require-role";
import { parsePagination } from "../lib/pagination";
import {
  ACTIVE_BOOKING_STATUSES,
  checkAgencyType,
  checkImageUrls,
  selectTourismSpots,
  selectVehicles,
  formatTourismSpot,
  formatVehicle,
} from "../lib/agency-queries";

const router: IRouter = Router();
router.use(requireRole("admin"));

// ── Agencies ───────────────────────────────────────────────────────────────────

function formatAgency(a: typeof agenciesTable.$inferSelect) {
  return { id: a.id, type: a.type, name: a.name, city: a.city, phone: a.phone, createdAt: a.createdAt.toISOString() };
}

/** Number of catalog items (hotels, tourism spots, vehicles) owned by the agency. */
async function countAgencyItems(agencyId: number): Promise<number> {
  const [{ count }] = await db.select({
    count: sql<number>`(
      (SELECT count(*) FROM ${hotelsTable} WHERE ${hotelsTable.agencyId} = ${agencyId})
      + (SELECT count(*) FROM ${tourismSpotsTable} WHERE ${tourismSpotsTable.agencyId} = ${agencyId})
      + (SELECT count(*) FROM ${vehiclesTable} WHERE ${vehiclesTable.agencyId} = ${agencyId})
    )::int`,
  }).from(agenciesTable).where(eq(agenciesTable.id, agencyId));
  return count;
}

/** True if any hotel / tourism / vehicle booking of the agency is still pending or confirmed. */
async function hasActiveAgencyBookings(agencyId: number): Promise<boolean> {
  const [hotel] = await db
    .select({ id: hotelBookingsTable.id })
    .from(hotelBookingsTable)
    .innerJoin(hotelsTable, eq(hotelBookingsTable.hotelId, hotelsTable.id))
    .where(and(eq(hotelsTable.agencyId, agencyId), inArray(hotelBookingsTable.status, ACTIVE_BOOKING_STATUSES)))
    .limit(1);
  const [tourism] = await db
    .select({ id: tourismBookingsTable.id })
    .from(tourismBookingsTable)
    .innerJoin(tourismSpotsTable, eq(tourismBookingsTable.spotId, tourismSpotsTable.id))
    .where(and(eq(tourismSpotsTable.agencyId, agencyId), inArray(tourismBookingsTable.status, ACTIVE_BOOKING_STATUSES)))
    .limit(1);
  const [vehicle] = await db
    .select({ id: vehicleBookingsTable.id })
    .from(vehicleBookingsTable)
    .innerJoin(vehiclesTable, eq(vehicleBookingsTable.vehicleId, vehiclesTable.id))
    .where(and(eq(vehiclesTable.agencyId, agencyId), inArray(vehicleBookingsTable.status, ACTIVE_BOOKING_STATUSES)))
    .limit(1);
  return !!(hotel || tourism || vehicle);
}

router.get("/admin/agencies", async (req, res): Promise<void> => {
  const query = GetAdminAgenciesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const agencies = await db
    .select()
    .from(agenciesTable)
    .where(query.data.type ? eq(agenciesTable.type, query.data.type) : undefined)
    .orderBy(agenciesTable.type, agenciesTable.name, agenciesTable.id);
  res.json(agencies.map(formatAgency));
});

router.post("/admin/agencies", async (req, res): Promise<void> => {
  const body = CreateAgencyBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (!body.data.name.trim() || !body.data.city.trim()) { res.status(400).json({ error: "Le nom et la ville sont requis" }); return; }

  const [a] = await db.insert(agenciesTable).values({
    type: body.data.type, name: body.data.name.trim(), city: body.data.city.trim(), phone: body.data.phone ?? null,
  }).returning();
  res.status(201).json(formatAgency(a));
});

router.put("/admin/agencies/:agencyId", async (req, res): Promise<void> => {
  const params = UpdateAgencyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateAgencyBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (!body.data.name.trim() || !body.data.city.trim()) { res.status(400).json({ error: "Le nom et la ville sont requis" }); return; }

  const [existing] = await db.select().from(agenciesTable).where(eq(agenciesTable.id, params.data.agencyId)).limit(1);
  if (!existing) { res.status(404).json({ error: "Agence non trouvée" }); return; }

  // Changing the type would leave hotels / spots / vehicles under the wrong kind of agency
  if (body.data.type !== existing.type && (await countAgencyItems(existing.id)) > 0) {
    res.status(409).json({ error: "Impossible de changer le type d'une agence qui a déjà un catalogue" });
    return;
  }

  const [a] = await db.update(agenciesTable).set({
    type: body.data.type, name: body.data.name.trim(), city: body.data.city.trim(), phone: body.data.phone ?? null,
  }).where(eq(agenciesTable.id, existing.id)).returning();
  res.json(formatAgency(a));
});

router.delete("/admin/agencies/:agencyId", async (req, res): Promise<void> => {
  const params = DeleteAgencyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Deleting cascades to the agency's catalog and bookings, so refuse while bookings are still live
  if (await hasActiveAgencyBookings(params.data.agencyId)) {
    res.status(409).json({ error: "Cette agence a des réservations en cours, annulez-les d'abord" });
    return;
  }

  await db.delete(agenciesTable).where(eq(agenciesTable.id, params.data.agencyId));
  res.json({ success: true });
});

// ── Tourism spots ──────────────────────────────────────────────────────────────

/** Error message if the spot values are out of range, or null if they're fine. */
function checkSpotValues(data: { name: string; location: string; price: number; capacityPerDay: number; images?: string[] | null }): string | null {
  if (!data.name.trim() || !data.location.trim()) return "Le nom et la localisation sont requis";
  if (data.price < 0) return "Le prix ne peut pas être négatif";
  if (!Number.isInteger(data.capacityPerDay) || data.capacityPerDay < 1) return "La capacité par jour doit être un entier positif";
  return checkImageUrls(data.images);
}

router.get("/admin/tourism-spots", async (req, res): Promise<void> => {
  const query = GetAdminTourismSpotsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(tourismSpotsTable);
  const results = await selectTourismSpots()
    .orderBy(tourismSpotsTable.location, tourismSpotsTable.name, tourismSpotsTable.id)
    .limit(pageSize).offset(offset);

  res.json({ items: results.map(({ spot, agency }) => formatTourismSpot(spot, agency)), total: count, page, pageSize });
});

router.post("/admin/tourism-spots", async (req, res): Promise<void> => {
  const body = CreateTourismSpotBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const valueError = checkSpotValues(body.data);
  if (valueError) { res.status(400).json({ error: valueError }); return; }
  const agencyError = await checkAgencyType(body.data.agencyId, "tourism");
  if (agencyError) { res.status(400).json({ error: agencyError }); return; }

  const [spot] = await db.insert(tourismSpotsTable).values({
    agencyId: body.data.agencyId, name: body.data.name.trim(), description: body.data.description ?? null,
    location: body.data.location.trim(), price: String(body.data.price), capacityPerDay: body.data.capacityPerDay,
    images: body.data.images ?? null, isActive: body.data.isActive ?? true,
  }).returning();

  const [result] = await selectTourismSpots().where(eq(tourismSpotsTable.id, spot.id)).limit(1);
  res.status(201).json(formatTourismSpot(result.spot, result.agency));
});

router.put("/admin/tourism-spots/:spotId", async (req, res): Promise<void> => {
  const params = UpdateTourismSpotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateTourismSpotBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const valueError = checkSpotValues(body.data);
  if (valueError) { res.status(400).json({ error: valueError }); return; }
  const agencyError = await checkAgencyType(body.data.agencyId, "tourism");
  if (agencyError) { res.status(400).json({ error: agencyError }); return; }

  const [spot] = await db.update(tourismSpotsTable).set({
    agencyId: body.data.agencyId, name: body.data.name.trim(), description: body.data.description ?? null,
    location: body.data.location.trim(), price: String(body.data.price), capacityPerDay: body.data.capacityPerDay,
    images: body.data.images ?? null,
    ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
  }).where(eq(tourismSpotsTable.id, params.data.spotId)).returning();
  if (!spot) { res.status(404).json({ error: "Site touristique non trouvé" }); return; }

  const [result] = await selectTourismSpots().where(eq(tourismSpotsTable.id, spot.id)).limit(1);
  res.json(formatTourismSpot(result.spot, result.agency));
});

router.delete("/admin/tourism-spots/:spotId", async (req, res): Promise<void> => {
  const params = DeleteTourismSpotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [booking] = await db
    .select({ id: tourismBookingsTable.id })
    .from(tourismBookingsTable)
    .where(and(eq(tourismBookingsTable.spotId, params.data.spotId), inArray(tourismBookingsTable.status, ACTIVE_BOOKING_STATUSES)))
    .limit(1);
  if (booking) { res.status(409).json({ error: "Ce site a des réservations en cours, désactivez-le plutôt" }); return; }

  await db.delete(tourismSpotsTable).where(eq(tourismSpotsTable.id, params.data.spotId));
  res.json({ success: true });
});

// ── Vehicles ───────────────────────────────────────────────────────────────────

/** Error message if the vehicle values are out of range, or null if they're fine. */
function checkVehicleValues(data: { brand: string; model: string; category: string; seats: number; pricePerDay: number; images?: string[] | null }): string | null {
  if (!data.brand.trim() || !data.model.trim() || !data.category.trim()) return "La marque, le modèle et la catégorie sont requis";
  if (!Number.isInteger(data.seats) || data.seats < 1) return "Le nombre de places doit être un entier positif";
  if (data.pricePerDay <= 0) return "Le prix par jour doit être positif";
  return checkImageUrls(data.images);
}

router.get("/admin/vehicles", async (req, res): Promise<void> => {
  const query = GetAdminVehiclesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(vehiclesTable);
  const results = await selectVehicles()
    .orderBy(vehiclesTable.brand, vehiclesTable.model, vehiclesTable.id)
    .limit(pageSize).offset(offset);

  res.json({ items: results.map(({ vehicle, agency }) => formatVehicle(vehicle, agency)), total: count, page, pageSize });
});

router.post("/admin/vehicles", async (req, res): Promise<void> => {
  const body = CreateVehicleBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const valueError = checkVehicleValues(body.data);
  if (valueError) { res.status(400).json({ error: valueError }); return; }
  const agencyError = await checkAgencyType(body.data.agencyId, "vehicle_rental");
  if (agencyError) { res.status(400).json({ error: agencyError }); return; }

  const [vehicle] = await db.insert(vehiclesTable).values({
    agencyId: body.data.agencyId, brand: body.data.brand.trim(), model: body.data.model.trim(),
    category: body.data.category.trim(), seats: body.data.seats, pricePerDay: String(body.data.pricePerDay),
    images: body.data.images ?? null, isActive: body.data.isActive ?? true,
  }).returning();

  const [result] = await selectVehicles().where(eq(vehiclesTable.id, vehicle.id)).limit(1);
  res.status(201).json(formatVehicle(result.vehicle, result.agency));
});

router.put("/admin/vehicles/:vehicleId", async (req, res): Promise<void> => {
  const params = UpdateVehicleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateVehicleBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const valueError = checkVehicleValues(body.data);
  if (valueError) { res.status(400).json({ error: valueError }); return; }
  const agencyError = await checkAgencyType(body.data.agencyId, "vehicle_rental");
  if (agencyError) { res.status(400).json({ error: agencyError }); return; }

  const [vehicle] = await db.update(vehiclesTable).set({
    agencyId: body.data.agencyId, brand: body.data.brand.trim(), model: body.data.model.trim(),
    category: body.data.category.trim(), seats: body.data.seats, pricePerDay: String(body.data.pricePerDay),
    images: body.data.images ?? null,
    ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
  }).where(eq(vehiclesTable.id, params.data.vehicleId)).returning();
  if (!vehicle) { res.status(404).json({ error: "Véhicule non trouvé" }); return; }

  const [result] = await selectVehicles().where(eq(vehiclesTable.id, vehicle.id)).limit(1);
  res.json(formatVehicle(result.vehicle, result.agency));
});

router.delete("/admin/vehicles/:vehicleId", async (req, res): Promise<void> => {
  const params = DeleteVehicleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [booking] = await db
    .select({ id: vehicleBookingsTable.id })
    .from(vehicleBookingsTable)
    .where(and(eq(vehicleBookingsTable.vehicleId, params.data.vehicleId), inArray(vehicleBookingsTable.status, ACTIVE_BOOKING_STATUSES)))
    .limit(1);
  if (booking) { res.status(409).json({ error: "Ce véhicule a des réservations en cours, désactivez-le plutôt" }); return; }

  await db.delete(vehiclesTable).where(eq(vehiclesTable.id, params.data.vehicleId));
  res.json({ success: true });
});

export default router;
