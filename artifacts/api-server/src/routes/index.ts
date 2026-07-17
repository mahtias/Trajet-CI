import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tripsRouter from "./trips";
import seatsRouter from "./seats";
import paymentsRouter from "./payments";
import ticketsRouter from "./tickets";
import clerkRouter from "./clerk";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(tripsRouter);
router.use(seatsRouter);
router.use(paymentsRouter);
router.use(ticketsRouter);
router.use(clerkRouter);
router.use(adminRouter);

export default router;
