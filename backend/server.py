import uvicorn
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core import config
from backend.services import logging_service, sensor_service
from backend.api import routes

# Initialize logging
logger = logging_service.setup_logging()

def create_app() -> FastAPI:
    app = FastAPI(
        title="Railway ITMS API",
        description="Production-ready backend for Railway Track Inspection System",
        version="2.0.0"
    )

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include modular routes
    app.include_router(routes.router)

    @app.on_event("startup")
    async def startup_event():
        logger.info("Starting up ITMS Backend...")
        loop = asyncio.get_event_loop()
        sensor_service.setup_sensor_callbacks(loop)

    @app.on_event("shutdown")
    async def shutdown_event():
        logger.info("Shutting down ITMS Backend...")
        from backend import sensors
        sensors.stop_acquisition()
        sensors.stop_recording()

    return app

app = create_app()

if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=config.PORT,
        reload=True if config.LOG_LEVEL == "DEBUG" else False
    )
