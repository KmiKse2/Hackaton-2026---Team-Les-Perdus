from datetime import date
from decimal import Decimal

from sqlalchemy import select

from .models import Customer, Transaction

SCENARIOS = {
    1: [("ACME Belgium", "2650", "salary"), ("SNCB · abonnement", "-105", "commute")],
    2: [("Loyer · nouvel appartement", "-850", "rent"), ("IKEA Zaventem", "-620", "furniture"), ("Énergie · nouveau contrat", "-74", "energy")],
    3: [("Brussels Airlines", "-240", "flight"), ("Booking.com · Lisbonne", "-385", "hotel")],
}


def seed(db):
    if db.scalar(select(Customer.id).limit(1)) is not None:
        return
    people = [(1, "Thomas", "Étudiant → premier emploi", "TH", "2100"),
              (2, "Sophie", "Un nouveau chez-soi", "SO", "7800"),
              (3, "Marc", "Une escapade se prépare", "MA", "5400")]
    for cid, name, persona, initials, balance in people:
        db.add(Customer(id=cid, name=name, persona=persona, initials=initials, opening_balance=Decimal(balance)))
    db.flush()
    for cid, *_ in people:
        for month in (7, 8):
            rows = [("Virement familial" if cid == 1 else "Salaire mensuel", "500" if cid == 1 else "2800", "support" if cid == 1 else "salary"),
                    ("Colruyt", "-86.40", "groceries"), ("Spotify", "-10.99", "subscription"),
                    ("Café du quartier", "-12.50", "dining")]
            for index, (merchant, amount, category) in enumerate(rows):
                db.add(Transaction(customer_id=cid, date=date(2026, month, index + 1),
                                   merchant=merchant, amount=Decimal(amount), category=category,
                                   reference=f"seed-{month}-{index}"))
    db.commit()
