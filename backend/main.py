# main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from db import init_db, AsyncSessionLocal
from graph import load_graph_from_db
from routes import routing, scan, map as map_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    async with AsyncSessionLocal() as db:
        await load_graph_from_db(db)
    print("✅ DB ready, graph loaded")
    yield
    # Shutdown (nothing needed)


app = FastAPI(title="Indoor Nav API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],    # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve floor plan images as static files
app.mount("/maps", StaticFiles(directory="seed"), name="maps")

app.include_router(routing.router)
app.include_router(scan.router)
app.include_router(map_router.router)


@app.get("/health")
async def health():
    from graph import nav_graph
    return {"status": "ok", "nodes": len(nav_graph.nodes)}
