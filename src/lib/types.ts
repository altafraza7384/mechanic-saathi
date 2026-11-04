export type CarSosCategory = "car" | "battery" | "towing" | "other" | "custom";

export const CATEGORIES: {
  id: CarSosCategory;
  label: string;
}[] = [
  { id: "car", label: "Car Problem" },
  { id: "battery", label: "Battery Problem" },
  { id: "towing", label: "Towing" },
  { id: "other", label: "Other" },
  { id: "custom", label: "Custom" },
];

export function normalizeCategory(c: string): CarSosCategory | null {
  if (c === "mechanic") return "car";
  if (c === "tyre") return null;
  return c as CarSosCategory;
}

export function servesCategory(cats: string[], reqCat: string): boolean {
  const n = normalizeCategory(reqCat);
  if (!n) return false;
  return cats.map(normalizeCategory).includes(n);
}

export interface MechanicProfile {
  id: string;
  name: string;
  shopName: string;
  phone: string;
  // One-time OTP verification at profile setup (Google login never sends
  // an OTP). Only a verified number may be saved; changing the number
  // requires a fresh OTP for the new number.
  phoneVerified?: boolean;
  phoneVerifiedAt?: string | null;
  categories: CarSosCategory[];
  customServices?: string[];
  charges: string | null;
  workingHours: string | null;
  lat: number | null;
  lng: number | null;
  geohash: string | null;
  serviceRadiusKm: number;
  isOnline: boolean;
  isVerified: boolean;
  rating: number | null;
  totalJobs: number;
  // Admin-managed fields (set from the Driver Saathi admin panel).
  // Optional so old mechanic docs without them keep working: missing
  // status means "active", missing warnings means 0.
  status?: "active" | "held";
  warnings?: number;
  held_reason?: string | null;
  warning_history?: Array<{ reason: string; at: string; by: string }>;
}

export interface SosRequest {
  id: string;
  driverId: string;
  category: CarSosCategory;
  description: string | null;
  approxLat: number | null;
  approxLng: number | null;
  geohash: string | null;
  areaText: string | null;
  status: "pending" | "accepted" | "onway" | "arrived" | "completed" | "cancelled";
  mechanicId: string | null;
  mechanicName: string | null;
  mechanicPhone: string | null;
  cancelReason: string | null;
  chargesAgreed: number | null;
  rating: number | null;
  created_at: string;
}

export interface SosRequestDetails {
  id: string;
  requestId: string;
  driverId: string;
  driverName?: string | null;
  driverPhone: string;
  exactLat: number | null;
  exactLng: number | null;
  mechanicId: string | null;
}

export function categoryLabel(c: string): string {
  const label = CATEGORIES.find((x) => x.id === c)?.label;
  if (label) return label;
  if (c === "mechanic") return "Car Problem";
  if (c === "tyre") return "Tyre Help";
  return c;
}
