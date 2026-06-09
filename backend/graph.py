# graph.py
import heapq
import math
from collections import defaultdict
from typing import Optional


class NavGraph:
    def __init__(self):
        # adjacency list: node_id → [(cost, neighbor_id, accessible)]
        self.adj: dict[int, list[tuple[float, int, bool]]] = defaultdict(list)
        # node metadata: node_id → {x, y, label, type}
        self.nodes: dict[int, dict] = {}

    def add_node(self, node_id: int, x: float, y: float, label: str, type_: str):
        self.nodes[node_id] = {"x": x, "y": y, "label": label, "type": type_}

    def add_edge(self, u: int, v: int, cost: float, reverse_cost: Optional[float] = None, accessible: bool = True):
        self.adj[u].append((cost, v, accessible))
        rc = reverse_cost if reverse_cost is not None else cost
        self.adj[v].append((rc, u, accessible))

    def shortest_path(self, start: int, end: int, accessible_only: bool = False) -> list[int]:
        """Dijkstra's algorithm. Returns list of node IDs or empty list if no path."""
        if start == end:
            return [start]
        if start not in self.nodes or end not in self.nodes:
            return []

        dist = {start: 0.0}
        prev = {}
        pq = [(0.0, start)]

        while pq:
            d, u = heapq.heappop(pq)
            if u == end:
                break
            if d > dist.get(u, math.inf):
                continue
            for edge in self.adj[u]:
                if len(edge) == 3:
                    cost, v, accessible = edge
                else:
                    cost, v = edge
                    accessible = True

                if accessible_only and not accessible:
                    continue

                nd = d + cost
                if nd < dist.get(v, math.inf):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(pq, (nd, v))

        # No path found
        if end not in prev and end != start:
            return []

        # Reconstruct path
        path, node = [], end
        while node in prev:
            path.append(node)
            node = prev[node]
        path.append(start)
        return list(reversed(path))

    def euclidean_cost(self, u: int, v: int) -> float:
        """Straight-line pixel distance between two nodes."""
        n1, n2 = self.nodes[u], self.nodes[v]
        return math.sqrt((n1["x"] - n2["x"])**2 + (n1["y"] - n2["y"])**2)


# Module-level singleton — loaded once at startup
nav_graph = NavGraph()


async def load_graph_from_db(db):
    """Pull nodes + edges from DB, populate in-memory graph."""
    from sqlalchemy import text

    nodes_result = await db.execute(text("SELECT id, x, y, label, type FROM public.nodes"))
    for row in nodes_result.fetchall():
        nav_graph.add_node(row.id, row.x, row.y, row.label, row.type)

    edges_result = await db.execute(
        text("SELECT from_node, to_node, cost, reverse_cost, accessible FROM public.edges WHERE walkable = true")
    )
    for row in edges_result.fetchall():
        nav_graph.add_edge(row.from_node, row.to_node, row.cost, row.reverse_cost, row.accessible)
