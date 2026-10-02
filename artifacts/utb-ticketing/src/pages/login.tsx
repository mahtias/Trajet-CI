import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRequestOtp, useVerifyOtp, useGetMe, type OtpResponse } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { BusFront, ArrowLeft, Mail, MailWarning, ShieldAlert } from "lucide-react";

function buildSchemas(t: (key: string) => string) {
  return {
    phoneSchema: z.object({
      phone: z.string().min(8, t("common.invalidPhone")),
      name: z.string().optional(),
      // Optional: only checked when filled (same rule as the server)
      email: z.string().trim().max(254, t("login.invalidEmail")).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), t("login.invalidEmail")).optional(),
    }),
    otpSchema: z.object({
      otp: z.string().length(6, t("login.otpLength")),
    }),
  };
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  // Sent with the code: the e-mail is saved only once the phone number is verified
  const [email, setEmail] = useState("");
  // Set when the server says the code can't go by SMS to this number, so it needs an e-mail to send it
  const [emailRequired, setEmailRequired] = useState(false);
  // Account with tickets or bookings: an e-mail can't be attached at login, only by support after an identity check
  const [identityCheck, setIdentityCheck] = useState<string | null>(null);
  // How the code was actually delivered (SMS, e-mail, or e-mail after a failed SMS)
  const [delivery, setDelivery] = useState<OtpResponse | null>(null);

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const { refetch: refetchMe } = useGetMe({ query: { enabled: false } });

  const { phoneSchema, otpSchema } = useMemo(() => buildSchemas(t), [t]);

  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: {
      phone: "",
      name: "",
      email: "",
    },
  });

  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: {
      otp: "",
    },
  });

  const onPhoneSubmit = (values: z.infer<typeof phoneSchema>) => {
    const typedEmail = values.email?.trim() ?? "";
    setPhone(values.phone);
    setEmail(typedEmail);
    setIdentityCheck(null);
    requestOtp.mutate(
      // The server only uses this e-mail when the code can't go by SMS and the account has none yet
      { data: { phone: values.phone, name: values.name, ...(typedEmail ? { email: typedEmail } : {}) } },
      {
        onSuccess: (res) => {
          setDelivery(res);
          setEmailRequired(false);
          setStep("otp");
          if (res.devOtp) {
            toast({
              title: t("login.devCodeTitle"),
              description: t("login.devCodeDesc", { code: res.devOtp }),
            });
            otpForm.setValue("otp", res.devOtp);
          } else if (!res.smsFailed) {
            // A failed SMS is explained on the code screen itself, which stays visible
            toast(res.deliveryChannel === "sms"
              ? { title: t("login.codeSentSmsTitle"), description: t("login.codeSentSmsDesc", { phone: values.phone }) }
              : { title: t("login.codeSentEmailTitle"), description: t("login.codeSentEmailDesc", { email: res.emailHint ?? typedEmail }) });
          }
        },
        onError: (err: any) => {
          if (err?.data?.code === "IDENTITY_VERIFICATION_REQUIRED") {
            setIdentityCheck(err.data.error ?? t("login.identityCheckDesc"));
            return;
          }
          // No SMS possible and no e-mail on file: ask for it right here, then the user submits again
          if (err?.data?.code === "EMAIL_REQUIRED") {
            setEmailRequired(true);
            phoneForm.setError("email", { message: t("login.emailRequiredTitle") }, { shouldFocus: true });
            return;
          }
          if (typedEmail && (err?.status === 400 || err?.status === 409) && /mail/i.test(err?.data?.error ?? "")) {
            phoneForm.setError("email", { message: err.data.error }, { shouldFocus: true });
            return;
          }
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || err?.message || t("login.sendOtpError"),
          });
        },
      }
    );
  };

  const onOtpSubmit = (values: z.infer<typeof otpSchema>) => {
    verifyOtp.mutate(
      { data: { phone, otp: values.otp, ...(email ? { email } : {}) } },
      {
        onSuccess: async (user) => {
          await refetchMe();
          if (user.role === "admin" || user.role === "company_admin") {
            setLocation("/admin");
          } else if (user.role === "clerk") {
            setLocation("/clerk");
          } else {
            setLocation("/");
          }
        },
        onError: (err: any) => {
          // Problem with the e-mail (invalid, or already on another account): back to the form to fix it
          if (email && (err?.status === 400 || err?.status === 409)) {
            setStep("phone");
            phoneForm.setError("email", { message: err?.data?.error ?? t("login.invalidEmail") });
            return;
          }
          // Too many wrong codes: this one is dropped, back to the first step to ask for a new one
          if (err?.status === 429) setStep("phone");
          otpForm.reset({ otp: "" });
          toast({
            variant: "destructive",
            title: t("login.invalidCodeTitle"),
            description: err?.data?.error || err?.message || t("login.invalidCodeDesc"),
          });
        },
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Visual side */}
      <div className="hidden md:flex flex-col justify-center items-center w-1/2 bg-secondary p-12 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=3538&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
        <div className="relative z-10 max-w-md text-center flex flex-col items-center">
          <div className="bg-primary/20 p-4 rounded-full mb-8">
            <BusFront className="w-16 h-16 text-primary" />
          </div>
          <h1 className="text-4xl font-bold mb-4 font-sans">Trajet CI</h1>
          <p className="text-xl text-white/80">{t("login.heroSubtitle")}</p>
        </div>
      </div>

      {/* Form side */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          <div className="text-center md:text-left mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              {step === "phone" ? t("login.stepLoginTitle") : t("login.stepOtpTitle")}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {step === "phone"
                ? t("login.enterPhone")
                : delivery?.deliveryChannel === "email"
                  ? t("login.enterOtpEmail", { email: delivery.emailHint ?? email })
                  : t("login.enterOtp", { phone })}
            </p>
          </div>

          {step === "otp" && delivery?.smsFailed && (
            <Alert className="mb-6">
              <MailWarning className="h-4 w-4" />
              <AlertTitle>{t("login.smsFailedTitle")}</AlertTitle>
              <AlertDescription>{t("login.smsFailedDesc", { email: delivery.emailHint ?? "" })}</AlertDescription>
            </Alert>
          )}

          {step === "phone" ? (
            <Form {...phoneForm}>
              <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-6">
                <FormField
                  control={phoneForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("login.phoneLabel")}</FormLabel>
                      <FormControl>
                        <Input placeholder="07 XX XX XX XX" {...field} className="h-12" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={phoneForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("login.nameLabel")}</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} className="h-12" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {identityCheck && (
                  <Alert variant="destructive">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>{t("login.identityCheckTitle")}</AlertTitle>
                    <AlertDescription>{identityCheck}</AlertDescription>
                  </Alert>
                )}
                {emailRequired && (
                  <Alert>
                    <Mail className="h-4 w-4" />
                    <AlertTitle>{t("login.emailRequiredTitle")}</AlertTitle>
                    <AlertDescription>{t("login.emailRequiredDesc")}</AlertDescription>
                  </Alert>
                )}
                <FormField
                  control={phoneForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{emailRequired ? t("login.emailLabelRequired") : t("login.emailLabel")}</FormLabel>
                      <FormControl>
                        <Input type="email" inputMode="email" autoComplete="email" placeholder="nom@exemple.com" {...field} className="h-12" />
                      </FormControl>
                      {!emailRequired && <p className="text-xs text-muted-foreground">{t("login.emailHint")}</p>}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full h-12 text-base font-bold" disabled={requestOtp.isPending}>
                  {requestOtp.isPending ? t("login.sending") : t("login.receiveCode")}
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...otpForm}>
              <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-6">
                <FormField
                  control={otpForm.control}
                  name="otp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("login.otpLabel")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="123456"
                          {...field}
                          className="h-12 text-center text-2xl tracking-widest font-mono"
                          maxLength={6}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex flex-col gap-3">
                  <Button type="submit" className="w-full h-12 text-base font-bold" disabled={verifyOtp.isPending}>
                    {verifyOtp.isPending ? t("login.verifying") : t("login.verify")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep("phone")}
                    className="w-full"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" /> {t("common.back")}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}
