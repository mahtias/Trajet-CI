import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tripsRouter from "./trips";
import paymentsRouter from "./payments";
import ticketsRouter from "./tickets";
import hotelsRouter from "./hotels";
import tourismRouter from "./tourism";
import vehiclesRouter from "./vehicles";
import clerkRouter from "./clerk";
import adminRouter from "./admin";
import adminAgenciesRouter from "./admin-agencies";
import uploadsRouter from "./uploads";
import exchangeRatesRouter from "./exchange-rates";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(tripsRouter);
router.use(paymentsRouter);
router.use(ticketsRouter);
router.use(hotelsRouter);
router.use(tourismRouter);
router.use(vehiclesRouter);
router.use(uploadsRouter); // requireRole("admin") is applied per route, not router-wide
router.use(exchangeRatesRouter); // public GET + admin PUT (per-route requireRole)
// Routers below apply requireRole() to every request that reaches them: keep public routers above.
router.use(clerkRouter);
router.use(adminRouter);
router.use(adminAgenciesRouter);

export default router;
