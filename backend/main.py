import os
import secrets
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine, get_db
from .models import Customer, Insight, Transaction
from .seed import SCENARIOS, seed
from .services.engine import detect, financial_summary
from .services.gemini import personalize


@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title="LifeFlow · Demo API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-Demo-Token"])


def authorize(x_demo_token: str = Header(default="")):
    expected = os.getenv("DEMO_API_TOKEN", "")
    if expected and not secrets.compare_digest(x_demo_token, expected):
        raise HTTPException(401, "Jeton de démonstration invalide")


protected = [Depends(authorize)]


def customer_or_404(db, customer_id, lock=False):
    query = select(Customer).where(Customer.id == customer_id)
    if lock:
        query = query.with_for_update()
    customer = db.scalar(query)
    if customer is None:
        raise HTTPException(404, "Client introuvable")
    return customer


def transactions_for(db, customer_id):
    return list(db.scalars(select(Transaction).where(Transaction.customer_id == customer_id).order_by(Transaction.date.desc(), Transaction.id.desc())))


def refresh_insights(db, customer_id):
    _, events = detect(transactions_for(db, customer_id))
    existing = {item.type: item for item in db.scalars(select(Insight).where(Insight.customer_id == customer_id))}
    active = set()
    for event in events:
        active.add(event["type"])
        item = existing.get(event["type"])
        if item is None:
            item = Insight(customer_id=customer_id, **event, personalization=personalize(event))
            db.add(item)
        else:
            item.score, item.evidence = event["score"], event["evidence"]
    for kind, item in existing.items():
        if kind not in active:
            db.delete(item)
    db.flush()


def snapshot(db, customer):
    txs = transactions_for(db, customer.id)
    signals, _ = detect(txs)
    insights = list(db.scalars(select(Insight).where(Insight.customer_id == customer.id).order_by(Insight.score.desc(), Insight.id)))
    return {"customer": {"id": customer.id, "name": customer.name, "persona": customer.persona,
                         "initials": customer.initials, "simulated": customer.simulated},
            "financial": financial_summary(customer, txs), "signals": signals,
            "events": [{"id": i.id, "type": i.type, "score": i.score, "status": i.status,
                        "evidence": i.evidence, "personalization": i.personalization} for i in insights],
            "transactions": [{"id": t.id, "date": t.date.isoformat(), "merchant": t.merchant,
                              "amount": str(t.amount), "category": t.category} for t in txs]}


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok", "mode": "synthetic-demo"}


@app.get("/api/customers", dependencies=protected)
def customers(db: Session = Depends(get_db)):
    return [{"id": c.id, "name": c.name, "persona": c.persona, "initials": c.initials} for c in db.scalars(select(Customer).order_by(Customer.id))]


@app.get("/api/customers/{customer_id}", dependencies=protected)
def customer_state(customer_id: int, db: Session = Depends(get_db)):
    return snapshot(db, customer_or_404(db, customer_id))


@app.get("/api/customers/{customer_id}/transactions", dependencies=protected)
def transactions(customer_id: int, db: Session = Depends(get_db)):
    return snapshot(db, customer_or_404(db, customer_id))["transactions"]


@app.get("/api/customers/{customer_id}/insights", dependencies=protected)
def insights(customer_id: int, db: Session = Depends(get_db)):
    state = snapshot(db, customer_or_404(db, customer_id))
    return {"signals": state["signals"], "events": state["events"]}


@app.post("/api/customers/{customer_id}/simulate", dependencies=protected)
def simulate(customer_id: int, db: Session = Depends(get_db)):
    customer = customer_or_404(db, customer_id, lock=True)
    if not customer.simulated:
        for index, (merchant, amount, category) in enumerate(SCENARIOS[customer_id]):
            db.add(Transaction(customer_id=customer_id, date=date(2026, 9, index + 1), merchant=merchant,
                               amount=Decimal(amount), category=category, reference=f"scenario-{index}"))
        customer.simulated = True
        try:
            db.flush()
            refresh_insights(db, customer_id)
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Simulation déjà en cours, actualisez la vue")
    return snapshot(db, customer)


@app.post("/api/customers/{customer_id}/reset", dependencies=protected)
def reset(customer_id: int, db: Session = Depends(get_db)):
    customer = customer_or_404(db, customer_id, lock=True)
    db.execute(delete(Insight).where(Insight.customer_id == customer_id))
    db.execute(delete(Transaction).where(Transaction.customer_id == customer_id, ~Transaction.reference.like("seed-%")))
    customer.simulated = False
    db.commit()
    return snapshot(db, customer)


class Feedback(BaseModel):
    status: Literal["confirmed", "dismissed"]


@app.post("/api/customers/{customer_id}/insights/{insight_id}/feedback", dependencies=protected)
def feedback(customer_id: int, insight_id: int, payload: Feedback, db: Session = Depends(get_db)):
    customer = customer_or_404(db, customer_id, lock=True)
    item = db.scalar(select(Insight).where(Insight.id == insight_id, Insight.customer_id == customer_id))
    if item is None:
        raise HTTPException(404, "Événement introuvable pour ce client")
    item.status = payload.status
    db.commit()
    return snapshot(db, customer)


class NewTransaction(BaseModel):
    customer_id: int = Field(gt=0)
    date: date
    merchant: str = Field(min_length=1, max_length=100, pattern=r"\S")
    amount: Decimal = Field(max_digits=12, decimal_places=2, allow_inf_nan=False)
    category: Literal["salary", "support", "commute", "rent", "furniture", "energy", "flight", "hotel", "groceries", "subscription", "dining", "other"]
    reference: str = Field(min_length=1, max_length=80, pattern=r"^user-[a-zA-Z0-9_-]+$")


@app.post("/api/transactions", dependencies=protected, status_code=201)
def add_transaction(payload: NewTransaction, db: Session = Depends(get_db)):
    customer = customer_or_404(db, payload.customer_id, lock=True)
    db.add(Transaction(**payload.model_dump()))
    try:
        db.flush()
        refresh_insights(db, customer.id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Référence déjà utilisée pour ce client")
    return snapshot(db, customer)


dashboard = Path(__file__).resolve().parent.parent / "dashboard"
app.mount("/assets", StaticFiles(directory=dashboard), name="assets")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(dashboard / "index.html")
