"use client";

import Link from "next/link";
import { useEffect, type ComponentProps } from "react";
import { track, type AnalyticsEvent } from "@/lib/analytics";
import type { ProjectType } from "@/lib/leadSchema";

type Props = ComponentProps<typeof Link> & {
  event: AnalyticsEvent;
  eventParams?: Record<string, string | number>;
  /** Предвыбор типа проекта в форме-брифе. */
  presetType?: ProjectType;
};

export const BRIEF_PRESET_EVENT = "brief:preset";

export function TrackedLink({ event, eventParams, presetType, onClick, ...props }: Props) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        track(event, eventParams);
        if (presetType) window.dispatchEvent(new CustomEvent(BRIEF_PRESET_EVENT, { detail: presetType }));
        onClick?.(e);
      }}
    />
  );
}

export function TrackPageView({ event }: { event: AnalyticsEvent }) {
  useEffect(() => track(event), [event]);
  return null;
}
