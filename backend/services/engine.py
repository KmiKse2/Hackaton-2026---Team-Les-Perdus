"""Explainable demo heuristics. Scores are rule weights, NOT probabilities."""
from datetime import timedelta
from decimal import Decimal

COPY = {
    "FIRST_JOB": {"label": "Premier emploi possible", "title": "Un nouveau chapitre ?", "message": "Un premier salaire apparaît dans votre historique. Avez-vous commencé un nouveau travail ?", "action": "Préparer mon budget", "tip": "Listez vos dépenses fixes, puis choisissez une épargne mensuelle qui vous laisse une marge confortable."},
    "MOVING": {"label": "Déménagement possible", "title": "Un nouveau chez-vous ?", "message": "Un loyer, des meubles et de nouvelles dépenses d’énergie apparaissent. Avez-vous déménagé ?", "action": "Organiser mon installation", "tip": "Pensez au changement d’adresse, aux contrats d’énergie et à mettre à jour votre budget logement."},
    "TRAVEL": {"label": "Voyage possible", "title": "Une escapade en vue ?", "message": "Des réservations de transport et d’hébergement apparaissent. Préparez-vous un voyage ?", "action": "Préparer mon voyage", "tip": "Vérifiez les conditions d’utilisation de votre carte à destination et prévoyez un budget quotidien."},
}


def detect(transactions):
    if not transactions:
        return [], []
    latest = max(t.date for t in transactions)
    cutoff = latest - timedelta(days=30)
    recent = [t for t in transactions if t.date > cutoff]
    previous = [t for t in transactions if t.date <= cutoff]
    signals = []

    def add(key, label, category, credit=False, fresh=False):
        hits = [t for t in recent if t.category == category and (t.amount > 0 if credit else t.amount < 0)]
        if hits and not (fresh and any(t.category == category and (t.amount > 0 if credit else t.amount < 0) for t in previous)):
            signals.append({"type": key, "label": label, "transaction_ids": [t.id for t in hits]})

    add("new_salary", "Premier salaire observé dans l’historique", "salary", credit=True, fresh=True)
    add("commute", "Dépenses de trajet domicile-travail", "commute")
    add("new_rent", "Nouveau paiement de loyer", "rent", fresh=True)
    add("furniture", "Achat de mobilier", "furniture")
    add("energy", "Nouveau paiement d’énergie", "energy", fresh=True)
    add("flight", "Réservation de transport aérien", "flight")
    add("hotel", "Réservation d’hébergement", "hotel")
    by_type = {s["type"]: s for s in signals}
    rules = [("FIRST_JOB", {"new_salary": 60, "commute": 20}, {"new_salary"}),
             ("MOVING", {"new_rent": 35, "furniture": 25, "energy": 20}, {"new_rent"}),
             ("TRAVEL", {"flight": 40, "hotel": 40}, {"flight", "hotel"})]
    events = []
    for kind, weights, required in rules:
        score = sum(weight for signal, weight in weights.items() if signal in by_type)
        if required.issubset(by_type) and score >= 60:
            events.append({"type": kind, "score": score, "evidence": [dict(by_type[s], weight=w) for s, w in weights.items() if s in by_type]})
    return signals, events


def financial_summary(customer, transactions):
    balance = customer.opening_balance + sum((t.amount for t in transactions), Decimal(0))
    latest = max((t.date for t in transactions), default=None)
    period = [t for t in transactions if latest and (t.date.year, t.date.month) == (latest.year, latest.month)]
    return {"balance": str(balance), "income": str(sum((t.amount for t in period if t.amount > 0), Decimal(0))),
            "expenses": str(-sum((t.amount for t in period if t.amount < 0), Decimal(0))),
            "period": latest.strftime("%Y-%m") if latest else None}
