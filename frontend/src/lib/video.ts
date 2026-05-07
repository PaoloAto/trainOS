import type { ExerciseReferenceSource } from "@/lib/api";

export type YouTubePreview = {
  embedUrl: string;
  videoId: string;
  isShort: boolean;
  kind: "video" | "short" | "live";
};

export const sourceLabels: Record<ExerciseReferenceSource, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  website: "Website",
  other: "Other",
};

export const sourceBadgeClasses: Record<ExerciseReferenceSource, string> = {
  youtube: "border-red bg-red-muted text-red",
  instagram: "border-indigo bg-indigo-muted text-indigo",
  tiktok: "border-border bg-bg-elevated text-text-primary",
  website: "border-green bg-green-muted text-green",
  other: "border-amber bg-amber-muted text-amber",
};

export function detectReferenceSource(value: string): ExerciseReferenceSource {
  const lower = value.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("instagram.com")) return "instagram";
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.startsWith("http")) return "website";
  return "other";
}

export function getYouTubePreview(value: string): YouTubePreview | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    let videoId = "";
    let isShort = false;
    let kind: YouTubePreview["kind"] = "video";

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (host.endsWith("youtube.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v") ?? "";
      } else if (parts[0] === "shorts") {
        videoId = parts[1] ?? "";
        isShort = true;
        kind = "short";
      } else if (parts[0] === "live") {
        videoId = parts[1] ?? "";
        kind = "live";
      } else if (parts[0] === "embed") {
        videoId = parts[1] ?? "";
      }
    }

    const cleanId = videoId.match(/^[A-Za-z0-9_-]{6,}$/)?.[0];
    if (!cleanId) return null;

    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${cleanId}`,
      videoId: cleanId,
      isShort,
      kind,
    };
  } catch {
    return null;
  }
}

export function displayDomain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

export function referenceKindLabel(value: string): string {
  const preview = getYouTubePreview(value);
  if (!preview) return "Open link";
  if (preview.kind === "short") return "Short preview";
  if (preview.kind === "live") return "Live preview";
  return "Video preview";
}

export function externalReferenceLabel(source: ExerciseReferenceSource): string {
  if (source === "instagram") return "Instagram Reel";
  if (source === "tiktok") return "TikTok Clip";
  if (source === "website") return "Website";
  return "External";
}
