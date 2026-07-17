import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRequestOtp, useVerifyOtp, useGetMe } from "@workspace/api-client-react";

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
import { useToast } from "@/hooks/use-toast";
import { BusFront, ArrowLeft } from "lucide-react";

const phoneSchema = z.object({
  phone: z.string().min(8, "Numéro de téléphone invalide"),
  name: z.string().optional(),
});

const otpSchema = z.object({
  otp: z.string().length(6, "Le code doit contenir 6 chiffres"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const { refetch: refetchMe } = useGetMe({ query: { enabled: false } });

  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: {
      phone: "",
      name: "",
    },
  });

  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: {
      otp: "",
    },
  });

  const onPhoneSubmit = (values: z.infer<typeof phoneSchema>) => {
    setPhone(values.phone);
    requestOtp.mutate(
      { data: values },
      {
        onSuccess: (res) => {
          setStep("otp");
          if (res.devOtp) {
            toast({
              title: "Code de test",
              description: `Votre code OTP est ${res.devOtp}`,
            });
            otpForm.setValue("otp", res.devOtp);
          }
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Erreur",
            description: err?.message || "Impossible d'envoyer le code",
          });
        },
      }
    );
  };

  const onOtpSubmit = (values: z.infer<typeof otpSchema>) => {
    verifyOtp.mutate(
      { data: { phone, otp: values.otp } },
      {
        onSuccess: async (user) => {
          await refetchMe();
          if (user.role === "admin") {
            setLocation("/admin");
          } else if (user.role === "clerk") {
            setLocation("/clerk");
          } else {
            setLocation("/");
          }
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Code invalide",
            description: err?.message || "Veuillez vérifier votre code",
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
          <h1 className="text-4xl font-bold mb-4 font-sans">UTB Billetterie</h1>
          <p className="text-xl text-white/80">Le réseau de transport le plus fiable de Côte d'Ivoire. Réservez, payez et voyagez.</p>
        </div>
      </div>

      {/* Form side */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          <div className="text-center md:text-left mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              {step === "phone" ? "Connexion" : "Vérification"}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {step === "phone" 
                ? "Entrez votre numéro de téléphone pour continuer" 
                : `Entrez le code à 6 chiffres envoyé au ${phone}`}
            </p>
          </div>

          {step === "phone" ? (
            <Form {...phoneForm}>
              <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-6">
                <FormField
                  control={phoneForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Numéro de téléphone</FormLabel>
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
                      <FormLabel>Nom complet (Optionnel)</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} className="h-12" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full h-12 text-base font-bold" disabled={requestOtp.isPending}>
                  {requestOtp.isPending ? "Envoi..." : "Recevoir le code"}
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
                      <FormLabel>Code OTP</FormLabel>
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
                    {verifyOtp.isPending ? "Vérification..." : "Vérifier"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => setStep("phone")}
                    className="w-full"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Retour
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
