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
import adminCompanyRouter from "./admin-company";
import adminRouter from "./admin";
import adminAgenciesRouter from "./admin-agencies";
import uploadsRouter from "./uploads";
import exchangeRatesRouter from "./exchange-rates";
import { accountStatusGuard } from "../middlewares/account-status";

const router: IRouter = Router();

// Before any route: suspended accounts (or staff of a suspended company) are logged out and refused
router.use(accountStatusGuard);

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
// Routers below guard their own path prefix (/clerk, /admin) with requireRole().
router.use(clerkRouter);
router.use(adminCompanyRouter); // admin + company_admin (scoped to its company); must come before adminRouter
router.use(adminRouter);
router.use(adminAgenciesRouter);

export default router;
