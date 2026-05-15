from copy import deepcopy
from typing import Any


BASE_THEME = {
    "primaryColor": "#556b4f",
    "secondaryColor": "#2f6f73",
    "accentColor": "#d89b43",
    "textColor": "#17211f",
    "mutedColor": "#62706d",
    "lineColor": "#d8ded8",
    "paperColor": "#fbfaf5",
    "surfaceColor": "#fffdf7",
    "washColor": "#eff3ee",
}


TEMPLATE_THEME_PRESETS: dict[str, list[dict[str, Any]]] = {
    "kashmir-signature": [
        {
            "id": "alpine-mist",
            "name": "Alpine Mist",
            "isDefault": True,
            "tokens": {
                "primaryColor": "#556b4f",
                "secondaryColor": "#2f6f73",
                "accentColor": "#d89b43",
                "textColor": "#17211f",
                "mutedColor": "#62706d",
                "lineColor": "#d8ded8",
                "paperColor": "#fbfaf5",
                "surfaceColor": "#fffdf7",
                "washColor": "#eff3ee",
            },
        },
        {
            "id": "walnut-cream",
            "name": "Walnut Cream",
            "tokens": {
                "primaryColor": "#66513b",
                "secondaryColor": "#3f6b64",
                "accentColor": "#b98136",
                "textColor": "#211d19",
                "mutedColor": "#70685e",
                "lineColor": "#ded3c2",
                "paperColor": "#fbf6ee",
                "surfaceColor": "#fffaf2",
                "washColor": "#f1eadf",
            },
        },
        {
            "id": "slate-saffron",
            "name": "Slate Saffron",
            "tokens": {
                "primaryColor": "#40515a",
                "secondaryColor": "#2d6f73",
                "accentColor": "#d09638",
                "textColor": "#162024",
                "mutedColor": "#647174",
                "lineColor": "#d5dddc",
                "paperColor": "#f7f9f8",
                "surfaceColor": "#ffffff",
                "washColor": "#edf2f1",
            },
        },
    ],
    "kashmir-luxury": [
        {
            "id": "ivory-gold",
            "name": "Ivory Gold",
            "isDefault": True,
            "tokens": {
                "primaryColor": "#27372f",
                "secondaryColor": "#405f56",
                "accentColor": "#b8893b",
                "textColor": "#191f1d",
                "mutedColor": "#69716b",
                "lineColor": "#ddd1bc",
                "paperColor": "#f7f2e9",
                "surfaceColor": "#fffaf1",
                "washColor": "#efe5d5",
            },
        },
        {
            "id": "forest-champagne",
            "name": "Forest Champagne",
            "tokens": {
                "primaryColor": "#344b3b",
                "secondaryColor": "#6f7154",
                "accentColor": "#c99d4d",
                "textColor": "#18211d",
                "mutedColor": "#667064",
                "lineColor": "#d9d2bd",
                "paperColor": "#f8f4e8",
                "surfaceColor": "#fffbee",
                "washColor": "#eef0df",
            },
        },
        {
            "id": "midnight-gold",
            "name": "Midnight Gold",
            "tokens": {
                "primaryColor": "#182524",
                "secondaryColor": "#355e63",
                "accentColor": "#c7923e",
                "textColor": "#151b1a",
                "mutedColor": "#626f6c",
                "lineColor": "#d3c6ad",
                "paperColor": "#f3efe6",
                "surfaceColor": "#fbf7ee",
                "washColor": "#e9e4d8",
            },
        },
    ],
    "kashmir-executive": [
        {
            "id": "graphite-teal",
            "name": "Graphite Teal",
            "isDefault": True,
            "tokens": {
                "primaryColor": "#20312f",
                "secondaryColor": "#2f6f73",
                "accentColor": "#2f6f73",
                "textColor": "#16201f",
                "mutedColor": "#5d6865",
                "lineColor": "#cfd8d5",
                "paperColor": "#f7f9f8",
                "surfaceColor": "#ffffff",
                "washColor": "#edf3f1",
            },
        },
        {
            "id": "paper-olive",
            "name": "Paper Olive",
            "tokens": {
                "primaryColor": "#4d6048",
                "secondaryColor": "#6b7252",
                "accentColor": "#4d6048",
                "textColor": "#1d241d",
                "mutedColor": "#667061",
                "lineColor": "#d7dccf",
                "paperColor": "#faf9f3",
                "surfaceColor": "#ffffff",
                "washColor": "#eef1e8",
            },
        },
        {
            "id": "navy-copper",
            "name": "Navy Copper",
            "tokens": {
                "primaryColor": "#22313c",
                "secondaryColor": "#9a6639",
                "accentColor": "#9a6639",
                "textColor": "#172028",
                "mutedColor": "#626d72",
                "lineColor": "#d1d8da",
                "paperColor": "#f7f8f7",
                "surfaceColor": "#ffffff",
                "washColor": "#edf1f1",
            },
        },
    ],
    "kashmir-family": [
        {
            "id": "garden-sky",
            "name": "Garden Sky",
            "isDefault": True,
            "tokens": {
                "primaryColor": "#6f8f7a",
                "secondaryColor": "#6ea6b2",
                "accentColor": "#d89b43",
                "textColor": "#17211f",
                "mutedColor": "#62706d",
                "lineColor": "#d8ded8",
                "paperColor": "#fbfaf5",
                "surfaceColor": "#fffdf7",
                "washColor": "#eff3ee",
            },
        }
    ],
}


def default_template_theme_id(template_id: str) -> str:
    presets = TEMPLATE_THEME_PRESETS.get(template_id) or TEMPLATE_THEME_PRESETS["kashmir-signature"]
    default = next((preset for preset in presets if preset.get("isDefault")), presets[0])
    return default["id"]


def resolve_template_theme(template_id: str, theme_id: str | None) -> dict[str, str]:
    presets = TEMPLATE_THEME_PRESETS.get(template_id) or TEMPLATE_THEME_PRESETS["kashmir-signature"]
    selected = next((preset for preset in presets if preset["id"] == theme_id), None)
    selected = selected or next((preset for preset in presets if preset.get("isDefault")), presets[0])

    theme = deepcopy(BASE_THEME)
    theme.update(selected["tokens"])
    theme["id"] = selected["id"]
    theme["name"] = selected["name"]
    return theme


def template_theme_options(template_id: str) -> list[dict[str, Any]]:
    return [
        {
            "id": preset["id"],
            "name": preset["name"],
            "isDefault": bool(preset.get("isDefault")),
            "swatches": [
                preset["tokens"]["paperColor"],
                preset["tokens"]["primaryColor"],
                preset["tokens"]["accentColor"],
            ],
        }
        for preset in TEMPLATE_THEME_PRESETS.get(template_id, [])
    ]
