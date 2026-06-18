# graph.py
import heapq
import math
from collections import defaultdict
from typing import Optional


class NavGraph:
    def __init__(self):
        # adjacency list: node_id → [(cost, neighbor_id, accessible, edge_type, floor_change, floor_delta)]
        self.adj: dict[int, list[tuple]] = defaultdict(list)
        # node metadata: node_id → {x, y, label, type, floor_id, elevation}
        self.nodes: dict[int, dict] = {}
        # connector index: floor_id → [{node_id, type, label}]
        self.connectors: dict[int, list[dict]] = defaultdict(list)

    def add_node(self, node_id: int, x: float, y: float, label: str, type_: str,
                 floor_id: int = None, elevation: int = 0):
        self.nodes[node_id] = {
            "x": x, "y": y, "label": label, "type": type_,
            "floor_id": floor_id, "elevation": elevation,
        }
        if type_ in ("elevator", "stairs", "escalator") and floor_id is not None:
            self.connectors[floor_id].append({
                "node_id": node_id, "type": type_, "label": label,
            })

    def add_edge(self, u: int, v: int, cost: float,
                 reverse_cost: Optional[float] = None,
                 accessible: bool = True,
                 edge_type: str = "walkable",
                 floor_change: bool = False,
                 floor_delta: int = 0):
        """Store a 6-tuple in both directions."""
        rc = reverse_cost if reverse_cost is not None else cost
        self.adj[u].append((cost, v, accessible, edge_type, floor_change, floor_delta))
        self.adj[v].append((rc,  u, accessible, edge_type, floor_change, -floor_delta))

    def shortest_path(self, start: int, end: int, accessible_only: bool = False) -> list[int]:
        """Dijkstra. Returns ordered list of node IDs, or [] if no path.

        The graph already contains cross-floor edges (elevator/stairs with floor_change=True),
        so a single Dijkstra naturally finds inter-floor paths without special treatment.
        """
        if start == end:
            return [start]
        if start not in self.nodes or end not in self.nodes:
            return []

        dist = {start: 0.0}
        prev: dict[int, int] = {}
        pq = [(0.0, start)]

        while pq:
            d, u = heapq.heappop(pq)
            if u == end:
                break
            if d > dist.get(u, math.inf):
                continue

            for edge in self.adj[u]:
                cost, v, acc, _etype, _fc, _fd = edge

                if accessible_only and not acc:
                    continue

                nd = d + cost
                if nd < dist.get(v, math.inf):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(pq, (nd, v))

        if end not in prev and end != start:
            return []

        path: list[int] = []
        node = end
        while node in prev:
            path.append(node)
            node = prev[node]
        path.append(start)
        return list(reversed(path))

    def path_with_floors(self, path: list[int]) -> list[dict]:
        """Annotate each node in path with its floor_id and connector metadata.

        Returns a list of dicts:
          {node_id, floor_id, type, label, edge_type, floor_change}
        where edge_type and floor_change describe the *outgoing* edge to the next node.
        """
        result = []
        for i, node_id in enumerate(path):
            node = self.nodes.get(node_id, {})
            # Look up the edge to next node to get floor_change / edge_type
            edge_type = "walkable"
            floor_change = False
            if i < len(path) - 1:
                next_id = path[i + 1]
                for edge in self.adj.get(node_id, []):
                    cost, v, acc, etype, fc, fd = edge
                    if v == next_id:
                        edge_type = etype
                        floor_change = fc
                        break
            result.append({
                "node_id": node_id,
                "floor_id": node.get("floor_id"),
                "type": node.get("type"),
                "label": node.get("label"),
                "edge_type": edge_type,
                "floor_change": floor_change,
            })
        return result

    def euclidean_cost(self, u: int, v: int) -> float:
        """Straight-line pixel distance between two nodes."""
        n1, n2 = self.nodes[u], self.nodes[v]
        return math.sqrt((n1["x"] - n2["x"]) ** 2 + (n1["y"] - n2["y"]) ** 2)


# Module-level singleton — loaded once at startup
nav_graph = NavGraph()


async def load_graph_from_db(db):
    """Pull nodes + edges from DB and populate the in-memory graph."""
    from sqlalchemy import text

    rows = await db.execute(
        text("SELECT id, x, y, label, type, floor_id, elevation FROM public.nodes")
    )
    for row in rows.fetchall():
        nav_graph.add_node(
            row.id, row.x, row.y, row.label, row.type,
            floor_id=row.floor_id, elevation=row.elevation,
        )

    rows = await db.execute(
        text("""
            SELECT from_node, to_node, cost, reverse_cost, accessible,
                   edge_type, floor_change, floor_delta
            FROM public.edges
            WHERE walkable = true
        """)
    )
    for row in rows.fetchall():
        nav_graph.add_edge(
            row.from_node, row.to_node,
            row.cost, row.reverse_cost,
            row.accessible,
            row.edge_type   or "walkable",
            bool(row.floor_change),
            row.floor_delta or 0,
        )
