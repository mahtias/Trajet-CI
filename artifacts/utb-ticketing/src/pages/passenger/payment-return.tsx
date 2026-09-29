import { useEffect, useState } from "react";
import { Link, useSearch, useLocation } from "wouter";
import {
  useGetTicketPaymentStatus,
  getGetTicketPaymentStatusQueryKey,
  useGetTicket,
  getGetTicketQueryKey,
  useGetHotelBookingPaymentStatus,
  getGetHotelBookingPaymentStatusQueryKey,
  useGetHotelBooking,
  getGetHotelBookingQueryKey,
} from "@workspace/api-client-react";
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/hooks/use-language";

/**
 * Where PayDunya sends the customer back, for bus tickets (?ticketId=) and hotel bookings (?hotelBookingId=).
 * Polls every 3 s for at most 1 minute: the PayDunya webhook can arrive after the customer is back,
 * and only the webhook marks something as paid.
 */
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 60_000;
const TERMINAL = new Set(["paid", "failed", "expired", "refund_required"]);

export default function PaymentReturn() {
  const params = new URLSearchParams(useSearch());
  const ticketId = Number(params.get("ticketId")) || 0;
  const hotelBookingId = ticketId ? 0 : Number(params.get("hotelBookingId")) || 0;
  const isHotel = !!hotelBookingId;
  const cancelledByUser = params.get("cancelled") === "1";
  const { t } = useLanguage();
  const [, setLocation] = useLocation();

  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);

  // Keep polling until a final state or the timeout
  const refetchInterval = (query: { state: { data?: { paymentStatus?: string } } }) =>
    TERMINAL.has(query.state.data?.paymentStatus ?? "") ? false : POLL_INTERVAL_MS;

  const ticketStatus = useGetTicketPaymentStatus(ticketId, {
    query: { queryKey: getGetTicketPaymentStatusQueryKey(ticketId), enabled: !!ticketId && !timedOut, retry: false, refetchInterval },
  });
  const hotelStatus = useGetHotelBookingPaymentStatus(hotelBookingId, {
    query: { queryKey: getGetHotelBookingPaymentStatusQueryKey(hotelBookingId), enabled: isHotel && !timedOut, retry: false, refetchInterval },
  });
  // Only used to offer "try again" on the same trip / hotel
  const { data: ticket } = useGetTicket(ticketId, { query: { queryKey: getGetTicketQueryKey(ticketId), enabled: !!ticketId } });
  const { data: booking } = useGetHotelBooking(hotelBookingId, { query: { queryKey: getGetHotelBookingQueryKey(hotelBookingId), enabled: isHotel } });

  const { data, error } = isHotel ? hotelStatus : ticketStatus;
  const status = data?.paymentStatus;
  const httpStatus = (error as any)?.status as number | undefined;

  const itemHref = isHotel ? `/hotel-bookings/${hotelBookingId}` : `/tickets/${ticketId}`;
  const listHref = isHotel ? "/hotel-bookings" : "/tickets";
  const listLabel = t(isHotel ? "paymentReturn.myHotelBookings" : "paymentReturn.myTickets");
  const retryHref = isHotel ? (booking ? `/hotels/${booking.hotelId}` : "/hotels") : ticket ? `/trips/${ticket.tripId}` : "/";

  useEffect(() => {
    if (!status || TERMINAL.has(status)) return;
    const remaining = POLL_TIMEOUT_MS - (Date.now() - startedAt);
    const timer = window.setTimeout(() => setTimedOut(true), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [status, startedAt]);

  // Paid: show the ticket / booking (with its QR code)
  useEffect(() => {
    if (status !== "paid") return;
    const timer = window.setTimeout(() => setLocation(itemHref), 1500);
    return () => window.clearTimeout(timer);
  }, [status, itemHref, setLocation]);

  const checkAgain = () => {
    setStartedAt(Date.now());
    setTimedOut(false);
  };

  let icon = <Loader2 className="w-12 h-12 text-primary animate-spin" />;
  let title = t("paymentReturn.checking");
  let description = t("paymentReturn.checkingDesc");
  let actions: React.ReactNode = null;

  if ((!ticketId && !hotelBookingId) || httpStatus === 404 || httpStatus === 403) {
    icon = <XCircle className="w-12 h-12 text-destructive" />;
    title = t("paymentReturn.missingTicket");
    description = "";
    actions = <Button asChild><Link href={listHref}>{listLabel}</Link></Button>;
  } else if (httpStatus === 401) {
    icon = <AlertTriangle className="w-12 h-12 text-amber-600" />;
    title = t("paymentReturn.loginRequired");
    description = "";
    actions = <Button asChild><Link href="/login">{t("nav.login")}</Link></Button>;
  } else if (status === "paid") {
    icon = <CheckCircle2 className="w-12 h-12 text-green-600" />;
    title = t("paymentReturn.paid");
    description = t("paymentReturn.paidDesc");
    actions = <Button asChild><Link href={itemHref}>{t(isHotel ? "paymentReturn.viewBooking" : "paymentReturn.viewTicket")}</Link></Button>;
  } else if (status === "refund_required") {
    icon = <AlertTriangle className="w-12 h-12 text-amber-600" />;
    title = t("paymentReturn.refund");
    description = t(isHotel ? "paymentReturn.hotelRefundDesc" : "paymentReturn.refundDesc");
    actions = <Button asChild variant="outline"><Link href={listHref}>{listLabel}</Link></Button>;
  } else if (status === "failed" || status === "expired" || (cancelledByUser && status === "pending")) {
    icon = <XCircle className="w-12 h-12 text-destructive" />;
    const key = status === "expired" ? "expired" : cancelledByUser ? "cancelled" : "failed";
    title = t(`paymentReturn.${key}`);
    description = isHotel && key !== "expired"
      ? t(key === "cancelled" ? "paymentReturn.hotelCancelledDesc" : "paymentReturn.hotelFailedDesc")
      : t(`paymentReturn.${key}Desc`);
    actions = <Button asChild><Link href={retryHref}>{t("paymentReturn.retry")}</Link></Button>;
  } else if (timedOut) {
    icon = <Clock className="w-12 h-12 text-amber-600" />;
    title = t("paymentReturn.timeout");
    description = t("paymentReturn.timeoutDesc");
    actions = (
      <div className="flex gap-3 justify-center flex-wrap">
        <Button onClick={checkAgain}>{t("paymentReturn.checkAgain")}</Button>
        <Button asChild variant="outline"><Link href={listHref}>{listLabel}</Link></Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-lg">
      <Card>
        <CardContent className="p-10 text-center flex flex-col items-center gap-4">
          {icon}
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {description && <p className="text-muted-foreground">{description}</p>}
          {actions}
        </CardContent>
      </Card>
    </div>
  );
}
