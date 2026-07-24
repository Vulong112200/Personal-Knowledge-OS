import { z } from "zod";

export const graphNodeTypeSchema = z.enum(["document", "tag"]);
export type GraphNodeType = z.infer<typeof graphNodeTypeSchema>;

export const graphEdgeTypeSchema = z.enum(["shares_tag", "similar_content", "has_tag", "links_to"]);
export type GraphEdgeType = z.infer<typeof graphEdgeTypeSchema>;

export const graphNodeSchema = z.object({
  id: z.string().uuid(),
  nodeType: graphNodeTypeSchema,
  refId: z.string().uuid(),
  label: z.string(),
  color: z.string().nullable(),
});
export type GraphNodeDto = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  id: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  edgeType: graphEdgeTypeSchema,
  weight: z.number(),
});
export type GraphEdgeDto = z.infer<typeof graphEdgeSchema>;

export const graphResponseSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  totalNodeCount: z.number(),
  truncated: z.boolean(),
});
export type GraphResponseDto = z.infer<typeof graphResponseSchema>;

export const relatedDocumentSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string(),
});
export type RelatedDocumentDto = z.infer<typeof relatedDocumentSchema>;

export const WORKSPACE_GRAPH_NODE_LIMIT = 500;
