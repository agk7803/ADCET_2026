import logging
import sys
from backend.core import config

def setup_logging():
    logging.basicConfig(
        level=getattr(logging, config.LOG_LEVEL),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    logger = logging.getLogger("itms")
    logger.info(f"Logging initialized at level {config.LOG_LEVEL}")
    return logger
