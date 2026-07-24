-- AlterEnum: add a real document→document edge type produced by parsing [[wiki-links]] in
-- note content (backlinks). Kept as a standalone ADD VALUE (not used elsewhere in this
-- migration) so it commits cleanly, mirroring 20260723030308_add_has_tag_edge_type.
ALTER TYPE "GraphEdgeType" ADD VALUE 'links_to';
