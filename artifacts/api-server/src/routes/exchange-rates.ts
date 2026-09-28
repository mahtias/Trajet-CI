import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, exchangeRatesTable } from "@workspace/db";
import { UpdateExchangeRateParams, UpdateExchangeRateBody, DeleteExchangeRateParams } from "@workspace/api-zod";
import { requireRole } from "../middlewares/require-role";
import { formatExchangeRate, MIN_FCFA_PER_UNIT, MAX_FCFA_PER_UNIT } from "../lib/exchange-rates";

// Display-only rates: the server never converts anything, prices and payments stay in FCFA.
const router: IRouter = Router();

router.get("/exchange-rates", async (_req, res): Promise<void> => {
  const rates = await db.select().from(exchangeRatesTable).orderBy(exchangeRatesTable.currency);
  res.json(rates.map(formatExchangeRate));
});

// requireRole is applied per route: this router also serves the public GET above
router.put("/admin/exchange-rates/:currency", requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateExchangeRateParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Devise non prise en charge (EUR, USD ou CNY)" }); return; }
  const body = UpdateExchangeRateBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Le taux doit être un nombre strictement positif" }); return; }

  const { fcfaPerUnit } = body.data;
  if (!Number.isFinite(fcfaPerUnit) || fcfaPerUnit < MIN_FCFA_PER_UNIT || fcfaPerUnit > MAX_FCFA_PER_UNIT) {
    res.status(400).json({ error: `Le taux doit être compris entre ${MIN_FCFA_PER_UNIT} et ${MAX_FCFA_PER_UNIT} FCFA pour 1 unité` });
    return;
  }

  // numeric(12, 4): keep 4 decimals, enough for 655.957
  const value = fcfaPerUnit.toFixed(4);
  const updatedAt = new Date();
  const [rate] = await db
    .insert(exchangeRatesTable)
    .values({ currency: params.data.currency, fcfaPerUnit: value, updatedAt })
    .onConflictDoUpdate({ target: exchangeRatesTable.currency, set: { fcfaPerUnit: value, updatedAt } })
    .returning();
  res.json(formatExchangeRate(rate));
});

router.delete("/admin/exchange-rates/:currency", requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteExchangeRateParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Devise non prise en charge (EUR, USD ou CNY)" }); return; }

  // EUR is re-created at every API start (fixed official parity), so deleting it would not last
  if (params.data.currency === "EUR") {
    res.status(400).json({ error: "Le taux EUR est fixe (655,957) et ne peut pas être supprimé, seulement modifié" });
    return;
  }

  const [deleted] = await db.delete(exchangeRatesTable).where(eq(exchangeRatesTable.currency, params.data.currency)).returning();
  if (!deleted) { res.status(404).json({ error: "Aucun taux enregistré pour cette devise" }); return; }
  res.json({ success: true });
});

export default router;
