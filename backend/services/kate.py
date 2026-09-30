"""A local handoff contract. No Kate endpoint or credentials are invented."""

COPY = {
    "FIRST_JOB": {"label": "Nouvelle activité salariée possible", "title": "Vos revenus évoluent ?", "message": "Un salaire apparaît dans la période observée, avec des dépenses de transport. Votre activité professionnelle a-t-elle changé ?", "action": "Préparer mon budget", "tip": "Listez vos dépenses fixes avant d’adapter votre budget."},
    "MOVING": {"label": "Déménagement possible", "title": "Un nouveau chez-vous ?", "message": "Un nouveau loyer, du mobilier et des dépenses d’énergie apparaissent ensemble. Avez-vous déménagé ?", "action": "Organiser mon installation", "tip": "Faites le point sur votre adresse, vos contrats et votre budget logement."},
    "TRAVEL": {"label": "Voyage possible", "title": "Une escapade en vue ?", "message": "Des paiements évoquent un transport aérien et un hébergement. Préparez-vous un voyage ?", "action": "Préparer mon voyage", "tip": "Vérifiez les conditions de votre carte à destination et préparez votre budget."},
}


def personalize(event):
    return dict(COPY[event["type"]], source="local_preview_for_kate")


def handoff(analysis, events):
    """Only structured observations and hypothesis state; no names/IBAN/free text."""
    rejected = {e["type"] for e in events if e["status"] == "dismissed"}
    hypotheses = [{"type": e["type"], "score": e["score"], "status": e["status"],
                   "requires_confirmation": e["status"] != "confirmed",
                   "signal_ids": [s["id"] for s in e["evidence"]]}
                  for e in events if e["status"] != "dismissed"]
    return {
        "schema_version": "1.0", "integration": "contract_only", "sent_to_kate": False,
        "as_of": analysis["as_of"], "status": "blocked" if analysis["blocked"] else "ready",
        "observations": [{key: s[key] for key in ("id", "type", "label", "strength", "metrics", "limitations", "value", "confidence", "confidence_kind", "source", "timestamp", "status")}
                         for s in analysis["signals"]],
        "hypotheses": hypotheses, "rejected_hypotheses": sorted(rejected),
        "data_quality": analysis["quality"],
        "instructions": ["Les scores sont des poids de règles, pas des probabilités.",
                         "Ne pas réintroduire une hypothèse refusée par le client.",
                         "Un salaire observé ne prouve ni un premier emploi ni une récurrence.",
                         "Les messages de l’interface sont des aperçus locaux, pas des réponses de Kate."],
    }
