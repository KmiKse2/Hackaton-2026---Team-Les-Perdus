"""Optional text generation; only event type and labels leave the backend."""
import logging
import os

from pydantic import BaseModel, Field

from .engine import COPY

logger = logging.getLogger(__name__)


class Message(BaseModel):
    title: str = Field(min_length=3, max_length=100)
    message: str = Field(min_length=10, max_length=450)


def personalize(event):
    result = dict(COPY[event["type"]], source="template")
    if os.getenv("GEMINI_ENABLED", "false").lower() != "true":
        return result
    try:
        from google import genai
        from google.genai import types

        options = {"http_options": types.HttpOptions(timeout=8000)}
        if os.getenv("GOOGLE_CLOUD_PROJECT"):
            options.update(vertexai=True, project=os.environ["GOOGLE_CLOUD_PROJECT"],
                           location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"))
        else:
            options["api_key"] = os.environ["GEMINI_API_KEY"]
        with genai.Client(**options) as client:
            response = client.models.generate_content(
                model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
                contents="Événement possible : " + event["type"] + ". Signaux : " + "; ".join(e["label"] for e in event["evidence"]),
                config=types.GenerateContentConfig(
                    system_instruction="Rédige un titre et un message courts en français pour un prototype bancaire. Présente l’événement comme une hypothèse et demande confirmation. Ne propose aucun produit, chiffre, promesse ou conseil financier. N’affirme aucune capacité de la banque.",
                    response_mime_type="application/json", response_schema=Message,
                ),
            )
            message = Message.model_validate_json(response.text)
            result.update(message.model_dump(), source="gemini")
    except Exception:
        logger.warning("Gemini indisponible : utilisation du message local.")
    return result
