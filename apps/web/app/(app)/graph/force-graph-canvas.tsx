"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { GraphNodeDto } from "@pkos/contracts";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), { ssr: false });

const DOCUMENT_COLOR = "#6366f1";
const TAG_FALLBACK_COLOR = "#a1a1aa";

interface ForceGraphLink {
  id: string;
  source: string;
  target: string;
  edgeType: string;
  weight: number;
}

interface Props {
  mode: "2d" | "3d";
  data: {
    nodes: GraphNodeDto[];
    links: ForceGraphLink[];
    highlightIds: Set<string> | null;
  };
  /** Compact mode: fixed-height inline embed (e.g. document detail ego-graph) instead of
   * filling the whole absolute-positioned container. Always 2D regardless of `mode`. */
  compact?: boolean;
}

export default function ForceGraphCanvas({ mode, data, compact = false }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // react-force-graph's node/link objects are plain mutable records (the physics
  // simulation stamps x/y/vx/vy onto them at runtime), so its accessor props are typed
  // more loosely than our GraphNodeDto — `unknown` + a local cast is the interop boundary.
  const asNode = (value: unknown) => value as GraphNodeDto;
  const asLink = (value: unknown) => value as ForceGraphLink;

  const nodeColor = (node: GraphNodeDto) => (node.nodeType === "document" ? DOCUMENT_COLOR : (node.color ?? TAG_FALLBACK_COLOR));
  const isDimmed = (node: GraphNodeDto) => (data.highlightIds ? !data.highlightIds.has(node.id) : false);

  const effectiveMode = compact ? "2d" : mode;

  const commonProps = {
    graphData: { nodes: data.nodes, links: data.links },
    nodeId: "id",
    nodeLabel: (n: unknown) => {
      const node = asNode(n);
      return `${node.nodeType === "tag" ? "#" : ""}${node.label}`;
    },
    nodeColor: (n: unknown) => {
      const node = asNode(n);
      return isDimmed(node) ? "rgba(160,160,160,0.15)" : nodeColor(node);
    },
    nodeVal: (n: unknown) => (asNode(n).nodeType === "tag" ? 4 : 2),
    linkWidth: (link: unknown) => Math.min(1 + Math.log2((asLink(link).weight ?? 1) + 1), 6),
    linkColor: () => "rgba(150,150,150,0.35)",
    onNodeClick: (n: unknown) => {
      const node = asNode(n);
      if (node.nodeType === "document") router.push(`/documents/${node.refId}`);
    },
    width: size.width,
    height: size.height,
    backgroundColor: "rgba(0,0,0,0)",
    cooldownTicks: compact ? 50 : 100,
  };

  return (
    <div ref={containerRef} className={compact ? "relative h-full w-full" : "absolute inset-0"}>
      {effectiveMode === "2d" ? <ForceGraph2D {...commonProps} /> : <ForceGraph3D {...commonProps} />}
    </div>
  );
}
