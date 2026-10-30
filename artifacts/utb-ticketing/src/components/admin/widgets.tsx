import type { ComponentType, ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

import { cn } from "@/lib/utils";

/** CoreUI palette, used for widgets only (buttons/links keep the brand colours). */
export const WIDGET_COLORS = {
  primary: { bg: "bg-gradient-to-br from-[#5856d6] to-[#6b69e0]", solid: "#5856d6", soft: "bg-[#5856d6]/10 text-[#5856d6]", bar: "bg-[#5856d6]" },
  info: { bg: "bg-gradient-to-br from-[#2982cc] to-[#39f]", solid: "#3399ff", soft: "bg-[#3399ff]/10 text-[#3399ff]", bar: "bg-[#3399ff]" },
  warning: { bg: "bg-gradient-to-br from-[#f6960b] to-[#f9b115]", solid: "#f9b115", soft: "bg-[#f9b115]/15 text-[#c98a00]", bar: "bg-[#f9b115]" },
  danger: { bg: "bg-gradient-to-br from-[#d93737] to-[#e55353]", solid: "#e55353", soft: "bg-[#e55353]/10 text-[#e55353]", bar: "bg-[#e55353]" },
  success: { bg: "bg-gradient-to-br from-[#1b9e3e] to-[#2eb85c]", solid: "#2eb85c", soft: "bg-[#2eb85c]/10 text-[#2eb85c]", bar: "bg-[#2eb85c]" },
} as const;
export type WidgetColor = keyof typeof WIDGET_COLORS;

type ChartPoint = { label: string; value: number };

/** Percentage change, or null when there is nothing to compare against. */
export function trend(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function TrendBadge({ value, onColor }: { value: number | null | undefined; onColor?: boolean }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-semibold",
        onColor ? "text-white/85" : up ? "text-emerald-600" : "text-red-500",
      )}
    >
      ({up ? "+" : ""}{value.toFixed(1)}% <Icon className="h-3.5 w-3.5" />)
    </span>
  );
}

function MiniTooltip({ active, payload, format }: { active?: boolean; payload?: any[]; format?: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-md bg-slate-900/90 px-2 py-1 text-[11px] text-white shadow">
      <div className="opacity-70">{p.payload.label}</div>
      <div className="font-semibold">{format ? format(p.value) : p.value}</div>
    </div>
  );
}

/**
 * CoreUI "WidgetStatsA": coloured card with the value, a title and a small chart at the bottom.
 */
export function ChartStatWidget({
  color, value, title, change, data, chart = "line", format,
}: {
  color: WidgetColor;
  value: ReactNode;
  title: string;
  change?: number | null;
  data: ChartPoint[];
  chart?: "line" | "area" | "bar";
  format?: (n: number) => string;
}) {
  const tooltip = <Tooltip cursor={false} content={<MiniTooltip format={format} />} />;
  return (
    <div className={cn("rounded-md text-white shadow-sm overflow-hidden flex flex-col", WIDGET_COLORS[color].bg)}>
      <div className="px-4 pt-4 pb-0">
        <div className="text-2xl font-semibold leading-tight flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono">{value}</span>
          <TrendBadge value={change} onColor />
        </div>
        <div className="text-sm text-white/80 mt-0.5">{title}</div>
      </div>
      <div className={cn("mt-3", chart === "line" ? "h-[70px] px-3" : "h-[70px]")}>
        <ResponsiveContainer width="100%" height="100%">
          {chart === "bar" ? (
            <BarChart data={data} margin={{ top: 4, right: 12, left: 12, bottom: 8 }}>
              {tooltip}
              <Bar dataKey="value" fill="rgba(255,255,255,0.55)" radius={[2, 2, 0, 0]} />
            </BarChart>
          ) : chart === "area" ? (
            <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              {tooltip}
              <Area type="monotone" dataKey="value" stroke="rgba(255,255,255,0.65)" strokeWidth={2} fill="rgba(255,255,255,0.2)" dot={false} />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 12 }}>
              {tooltip}
              <Line type="monotone" dataKey="value" stroke="rgba(255,255,255,0.75)" strokeWidth={2} dot={{ r: 2.5, fill: color === "warning" ? "#f9b115" : WIDGET_COLORS[color].solid, stroke: "#fff" }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * CoreUI "WidgetStatsF": white card with a coloured icon block, the value and a title.
 */
export function IconStatWidget({
  color, icon: Icon, value, title, footer,
}: {
  color: WidgetColor;
  icon: ComponentType<{ className?: string }>;
  value: ReactNode;
  title: string;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-md bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-3 flex items-center gap-3">
        <div className={cn("h-14 w-14 shrink-0 rounded-md flex items-center justify-center text-white", WIDGET_COLORS[color].bar)}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="text-lg font-semibold font-mono truncate" style={{ color: WIDGET_COLORS[color].solid }}>{value}</div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 truncate">{title}</div>
        </div>
      </div>
      {footer && <div className="px-3 py-2 border-t border-slate-100 text-xs text-slate-500">{footer}</div>}
    </div>
  );
}

/**
 * CoreUI "WidgetStatsB": value, title, progress bar and a short note.
 */
export function ProgressStatWidget({
  color, value, title, percent, note, inverse = false,
}: {
  color: WidgetColor;
  value: ReactNode;
  title: string;
  percent: number;
  note?: ReactNode;
  inverse?: boolean;
}) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className={cn("rounded-md shadow-sm p-4", inverse ? cn(WIDGET_COLORS[color].bg, "text-white") : "bg-white border border-slate-200")}>
      <div className="text-2xl font-semibold font-mono">{value}</div>
      <div className={cn("text-sm", inverse ? "text-white/80" : "text-slate-500")}>{title}</div>
      <div className={cn("h-1 rounded-full my-3", inverse ? "bg-white/25" : "bg-slate-100")}>
        <div className={cn("h-1 rounded-full", inverse ? "bg-white" : WIDGET_COLORS[color].bar)} style={{ width: `${p}%` }} />
      </div>
      {note && <div className={cn("text-xs", inverse ? "text-white/75" : "text-slate-500")}>{note}</div>}
    </div>
  );
}

/** CoreUI card: white, small radius, header strip with a bottom border. */
export function AdminCard({
  title, subtitle, actions, children, footer, className, bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("rounded-md bg-white border border-slate-200 shadow-sm", className)}>
      {(title || actions) && (
        <div className="px-4 md:px-5 py-3 border-b border-slate-200 bg-slate-50/60 rounded-t-md flex flex-wrap items-center justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn("p-4 md:p-5", bodyClassName)}>{children}</div>
      {footer && <div className="px-4 md:px-5 py-4 border-t border-slate-200 bg-slate-50/40 rounded-b-md">{footer}</div>}
    </div>
  );
}

/** Footer cell of the main chart card: label, value, percentage and thin progress bar. */
export function ProgressGroup({ label, value, percent, color }: { label: string; value: ReactNode; percent?: number; color: WidgetColor }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-500 truncate">{label}</div>
      <div className="font-semibold text-slate-900 truncate">
        <span className="font-mono">{value}</span>
        {percent !== undefined && <span className="font-normal text-slate-500 text-xs ml-1">({percent.toFixed(0)}%)</span>}
      </div>
      <div className="h-1 rounded-full bg-slate-100 mt-2">
        <div className={cn("h-1 rounded-full", WIDGET_COLORS[color].bar)} style={{ width: `${Math.max(0, Math.min(100, percent ?? 100))}%` }} />
      </div>
    </div>
  );
}
