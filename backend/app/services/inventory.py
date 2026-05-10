import json
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"


def _read_json(filename: str) -> dict[str, Any]:
    """Load one JSON fixture from backend/data.

    v0.1.0 uses JSON files as lightweight stand-ins for database tables. Keeping
    the reads behind this function makes it straightforward to replace this
    module with real database queries later.
    """

    with (DATA_DIR / filename).open("r", encoding="utf-8") as file:
        return json.load(file)


def load_inventory() -> dict[str, Any]:
    """Load Kashmir master inventory for destinations, hotels, vehicles, etc."""

    return _read_json("kashmir_inventory.json")


def load_sample_proposal() -> dict[str, Any]:
    """Load the default proposal used to populate the builder UI."""

    return _read_json("sample_proposal.json")
