import { format, parseISO } from "date-fns";

export function formatShortDate(value: string) {
  return format(parseISO(value), "MMM d");
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatPace(secondsPerKm: number | null | undefined) {
  if (!secondsPerKm) return "--";
  const totalSeconds = Math.round(secondsPerKm);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

export function todayISODate() {
  return format(new Date(), "yyyy-MM-dd");
}
