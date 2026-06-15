"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { formatDateShort } from "@/lib/utils";

const GOLD = "#e93d3d";
const GOLD_LT = "#f17d7d";

const tooltipStyle = {
  background: "#17191e",
  border: "1px solid #343a42",
  borderRadius: 10,
  fontSize: 12,
  color: "#e7e9ec",
  padding: "8px 10px",
};

export function TrendLine({
  data,
  dataKey = "value",
  unit = "",
  optimalLow,
  optimalHigh,
  height = 200,
}: {
  data: { date: string; value: number }[];
  dataKey?: string;
  unit?: string;
  optimalLow?: number;
  optimalHigh?: number;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        {optimalLow !== undefined && optimalHigh !== undefined && (
          <ReferenceArea y1={optimalLow} y2={optimalHigh} fill={GOLD} fillOpacity={0.07} />
        )}
        <XAxis dataKey="date" tickFormatter={(d) => formatDateShort(d)} tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={40} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(d) => formatDateShort(d as string)}
          formatter={(v: number | string) => [`${v}${unit ? " " + unit : ""}`, ""]}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={GOLD}
          strokeWidth={2.2}
          dot={{ r: 3, fill: GOLD }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TrendArea({
  data,
  series,
  height = 220,
}: {
  data: Record<string, number | string>[];
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => formatDateShort(d as string)} tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => formatDateShort(d as string)} />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#grad-${s.key})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RevenueBars({
  data,
  height = 220,
}: {
  data: { name: string; revenue: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="barGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD_LT} />
            <stop offset="100%" stopColor={GOLD} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          formatter={(v: number | string) => [`$${Number(v).toLocaleString()}`, "Revenue"]}
        />
        <Bar dataKey="revenue" fill="url(#barGold)" radius={[6, 6, 0, 0]} maxBarSize={46} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PercentLine({
  data,
  height = 200,
  color = "#34d399",
}: {
  data: { name: string; value: number }[];
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="pctFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={34} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [`${v}%`, "Retained"]} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.2} fill="url(#pctFill)" dot={{ r: 3, fill: color }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CountBars({
  data,
  height = 200,
  label = "Clients",
}: {
  data: { name: string; value: number }[];
  height?: number;
  label?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="barWatch" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f17d7d" />
            <stop offset="100%" stopColor="#e93d3d" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={48} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          formatter={(v: number | string) => [v, label]}
        />
        <Bar dataKey="value" fill="url(#barWatch)" radius={[5, 5, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const DONUT_COLORS = ["#e93d3d", "#34d399", "#60a5fa", "#a78bfa", "#e0bd6e", "#2dd4bf"];

export function ServiceDonut({
  data,
  height = 220,
}: {
  data: { name: string; value: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={58}
          outerRadius={88}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number | string, n: string) => [`${v}%`, n]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// Radar — Alpha Score domains / multi-axis profiles.
export function RadarStat({
  data,
  height = 240,
  color = GOLD,
}: {
  data: { axis: string; value: number }[];
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: "#94a1a6", fontSize: 10 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.3} strokeWidth={2} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [v, "Score"]} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// Scatter — e.g. triage vs churn risk per client.
export function ScatterStat({
  data,
  xLabel,
  yLabel,
  height = 260,
}: {
  data: { x: number; y: number; name: string }[];
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" dataKey="x" name={xLabel} domain={[0, 100]} tickLine={false} axisLine={false} label={{ value: xLabel, position: "insideBottom", offset: -2, fill: "#6f7884", fontSize: 11 }} />
        <YAxis type="number" dataKey="y" name={yLabel} domain={[0, 100]} width={36} tickLine={false} axisLine={false} />
        <ZAxis range={[60, 60]} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ strokeDasharray: "3 3", stroke: "#343a42" }}
          formatter={(v: number | string, n: string) => [v, n === "x" ? xLabel : yLabel]}
          labelFormatter={() => ""}
          content={({ payload }) => {
            if (!payload || !payload.length) return null;
            const p = payload[0].payload as { name: string; x: number; y: number };
            return (
              <div style={tooltipStyle}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div>{xLabel}: {p.x}</div>
                <div>{yLabel}: {p.y}</div>
              </div>
            );
          }}
        />
        <Scatter data={data} fill={GOLD}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.y >= 50 ? "#f87171" : d.x >= 50 ? "#e0bd6e" : "#34d399"} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// Stacked area — revenue by service line over time, etc.
export function StackedArea({
  data,
  series,
  height = 240,
}: {
  data: Record<string, number | string>[];
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`sa-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.5} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string, n: string) => [`$${Number(v).toLocaleString()}`, n]} />
        {series.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId="1" stroke={s.color} strokeWidth={1.5} fill={`url(#sa-${s.key})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Donut with a center total label.
export function DonutCount({
  data,
  height = 200,
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number; color?: string }[];
  height?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
            {data.map((d, i) => (
              <Cell key={i} fill={d.color ?? DONUT_COLORS[i % DONUT_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string, n: string) => [v, n]} />
        </PieChart>
      </ResponsiveContainer>
      {centerValue !== undefined && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold text-ink-50">{centerValue}</span>
          {centerLabel && <span className="text-[10px] uppercase tracking-wide text-ink-500">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

// Tiny sparkline for KPI cards.
export function Sparkline({ data, color = GOLD, height = 36 }: { data: number[]; color?: string; height?: number }) {
  const d = data.map((value, i) => ({ i, value }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={d} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.6} fill={`url(#spark-${color.replace("#", "")})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export { DONUT_COLORS };
