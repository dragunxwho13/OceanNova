import { Bug, Droplets, FlaskConical, Gauge, Leaf, Thermometer, Waves, Wind, type LucideIcon } from "lucide-react";

export type RegionMetric = {
  key: string;
  label: string;
  unit: string;
  percent: number;
  icon: LucideIcon;
};

export type RegionProfile = {
  region: string;
  metrics: RegionMetric[];
};

const METRIC_META: { key: string; label: string; unit: string; icon: LucideIcon }[] = [
  { key: "sst", label: "Sea Surface Temp", unit: "°C dev", icon: Thermometer },
  { key: "salinity", label: "Salinity Drop", unit: "PSU dev", icon: Droplets },
  { key: "current", label: "Current Shear", unit: "m/s dev", icon: Wind },
  { key: "ph", label: "pH Acidification", unit: "pH dev", icon: FlaskConical },
  { key: "oxygen", label: "Dissolved Oxygen", unit: "mg/L dev", icon: Waves },
  { key: "chlorophyll", label: "Chlorophyll-a", unit: "mg/m³", icon: Leaf },
  { key: "hab", label: "HAB Risk Index", unit: "bloom risk", icon: Bug },
  { key: "pressure", label: "Hydrostatic Pressure", unit: "kPa dev", icon: Gauge },
];

// Percentage anomaly severity (0-100) for every metric, for every one of the 8 tracked ocean regions.
// Order matches METRIC_META: [sst, salinity, current, ph, oxygen, chlorophyll, hab, pressure]
const REGION_PERCENTS: Record<string, number[]> = {
  "North Pacific Gyre": [92, 34, 58, 21, 40, 27, 18, 12],
  "Bay of Bengal": [45, 81, 33, 29, 52, 61, 57, 15],
  "Drake Passage": [22, 19, 88, 24, 31, 14, 9, 41],
  "Great Barrier Reef": [63, 28, 22, 76, 44, 55, 48, 11],
  "Arabian Sea": [51, 46, 29, 33, 58, 64, 71, 17],
  "Norwegian Sea": [39, 24, 35, 18, 27, 21, 14, 20],
  "Gulf of Mexico": [57, 31, 26, 38, 66, 89, 84, 19],
  "Mariana Trench Rim": [12, 15, 33, 20, 28, 9, 7, 79],
};

export function getRegionProfile(region: string): RegionProfile | null {
  const clean = region.trim().replace(/\s+/g, " ");
  const percents = REGION_PERCENTS[clean];
  if (!percents) return null;
  return {
    region: clean,
    metrics: METRIC_META.map((meta, i) => ({ ...meta, percent: percents[i] })),
  };
}

export function statusColor(percent: number) {
  if (percent >= 66) return "#ff6b6b";
  if (percent >= 33) return "#ffd166";
  return "#4cc9f0";
}

export function statusLabel(percent: number) {
  if (percent >= 66) return "Critical";
  if (percent >= 33) return "Watch";
  return "Normal";
}
