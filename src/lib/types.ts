export type CarSosCategory = "tyre" | "mechanic" | "battery" | "other";

export const CATEGORIES: { id: CarSosCategory; label: string }[] = [
  { id: "tyre", label: "Tyre Help" },
  { id: "mechanic", label: "Car Mechanic" },
  { id: "battery", label: "Battery Problem" },
  { id: "other", label: "Other" },
];

export interface MechanicProfile {
  id: string;
  name: string;
  shopName: string;
  phone: string;
  categories: CarSosCategory[];
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
  status: "pending" | "accepted" | "onway" | "completed" | "cancelled";
  mechanicId: string | null;
  mechanicName: string | null;
  mechanicPhone: string | null;
  chargesAgreed: number | null;
  rating: number | null;
  created_at: string;
}

export interface SosRequestDetails {
  id: string;
  requestId: string;
  driverId: string;
  driverPhone: string;
  exactLat: number | null;
  exactLng: number | null;
  mechanicId: string | null;
}

export function categoryLabel(c: CarSosCategory): string {
  return CATEGORIES.find((x) => x.id === c)?.label ?? c;
}
