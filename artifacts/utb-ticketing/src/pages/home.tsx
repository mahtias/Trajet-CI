import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Search, ArrowRight, Ticket, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CityCombobox } from "@/components/city-combobox";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

const CITIES = [
  "Abidjan", "Bouaké", "Daloa", "Korhogo",
  "San-Pédro", "Yamoussoukro", "Man",
  "Gagnoa", "Divo", "Abengourou",
  "Katiola", "Ferkessédougou", "Duékoué", "Guiglo",
  "Bouaflé", "Soubré", "Danané", "Tengrela",
];

const POPULAR_ROUTES = [
  { origin: "Abidjan", destination: "Bouaké", price: "5 000 FCFA" },
  { origin: "Abidjan", destination: "Yamoussoukro", price: "3 500 FCFA" },
  { origin: "Abidjan", destination: "Daloa", price: "6 000 FCFA" },
  { origin: "Abidjan", destination: "San-Pédro", price: "7 000 FCFA" },
];

function buildFormSchema(t: (key: string) => string) {
  return z.object({
    origin: z.string().min(1, t("home.originRequired")),
    destination: z.string().min(1, t("home.destinationRequired")),
    date: z.date({
      required_error: t("home.dateRequired"),
    }),
  });
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { t, dateLocale } = useLanguage();
  const prefersReducedMotion = usePrefersReducedMotion();

  const formSchema = useMemo(() => buildFormSchema(t), [t]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      origin: "",
      destination: "",
      date: new Date(),
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    const searchParams = new URLSearchParams();
    searchParams.set("origin", values.origin);
    searchParams.set("destination", values.destination);
    searchParams.set("date", format(values.date, "yyyy-MM-dd"));

    setLocation(`/trips?${searchParams.toString()}`);
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden bg-secondary">
        {prefersReducedMotion ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url('/videos/hero-bus-poster.jpg')" }}
          />
        ) : (
          <video
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            poster="/videos/hero-bus-poster.jpg"
          >
            <source src="/videos/hero-bus.mp4" media="(min-width: 768px)" type="video/mp4" />
            <source src="/videos/hero-bus-mobile.mp4" type="video/mp4" />
          </video>
        )}
        <div className="absolute inset-0 bg-secondary/75"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
              {t("home.heroPrefix")}<span className="text-primary">{t("home.heroHighlight")}</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80">
              {t("home.heroSubtitle")}
            </p>
          </div>

          <div className="max-w-4xl mx-auto bg-card rounded-2xl shadow-xl p-4 md:p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <FormField
                  control={form.control}
                  name="origin"
                  render={({ field }) => (
                    <FormItem className="md:col-span-1">
                      <FormLabel className="text-foreground">{t("home.origin")}</FormLabel>
                      <CityCombobox
                        cities={CITIES}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t("home.cityPlaceholder")}
                        searchPlaceholder={t("home.citySearchPlaceholder")}
                        emptyText={t("home.cityEmpty")}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="destination"
                  render={({ field }) => (
                    <FormItem className="md:col-span-1">
                      <FormLabel className="text-foreground">{t("home.destination")}</FormLabel>
                      <CityCombobox
                        cities={CITIES}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t("home.cityPlaceholder")}
                        searchPlaceholder={t("home.citySearchPlaceholder")}
                        emptyText={t("home.cityEmpty")}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col md:col-span-1">
                      <FormLabel className="text-foreground">{t("home.date")}</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "h-12 w-full pl-3 text-left font-normal text-base bg-background",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                              {field.value ? (
                                format(field.value, "dd MMM yyyy", { locale: dateLocale })
                              ) : (
                                <span>{t("home.chooseDate")}</span>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date < new Date(new Date().setHours(0, 0, 0, 0))
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" size="lg" className="h-12 md:col-span-1 w-full text-base font-bold bg-primary hover:bg-primary/90">
                  <Search className="mr-2 h-5 w-5" /> {t("home.search")}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </section>

      {/* Popular Routes Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">{t("home.popularRoutes")}</h2>
            <div className="w-20 h-1 bg-primary rounded-full"></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {POPULAR_ROUTES.map((route, i) => (
              <Link
                key={i}
                href={`/trips?origin=${route.origin}&destination=${route.destination}&date=${format(new Date(), "yyyy-MM-dd")}`}
                className="group block"
              >
                <div className="bg-card border border-border rounded-xl p-6 transition-all hover:shadow-lg hover:border-primary/50 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <ArrowRight className="w-24 h-24 -rotate-45" />
                  </div>
                  <div className="flex flex-col gap-4 relative z-10">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-lg text-foreground">{route.origin}</span>
                      <ArrowRight className="w-5 h-5 text-primary" />
                      <span className="font-semibold text-lg text-foreground">{route.destination}</span>
                    </div>
                    <div className="pt-4 border-t border-border flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t("home.startingFrom")}</span>
                      <span className="font-bold text-accent font-mono text-lg">{route.price}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-card border-t border-border">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-2">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold">{t("home.featureSearchTitle")}</h3>
              <p className="text-muted-foreground">{t("home.featureSearchDesc")}</p>
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mb-2">
                <Ticket className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold">{t("home.featureTicketTitle")}</h3>
              <p className="text-muted-foreground">{t("home.featureTicketDesc")}</p>
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary mb-2">
                <MapPin className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold">{t("home.featurePaymentTitle")}</h3>
              <p className="text-muted-foreground">{t("home.featurePaymentDesc")}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
