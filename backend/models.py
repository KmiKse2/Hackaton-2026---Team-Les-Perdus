from datetime import date as DateValue
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, JSON, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    persona: Mapped[str] = mapped_column(String(120))
    initials: Mapped[str] = mapped_column(String(2))
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    simulated: Mapped[bool] = mapped_column(Boolean, default=False)


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (UniqueConstraint("customer_id", "reference"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    date: Mapped[DateValue] = mapped_column(Date)
    merchant: Mapped[str] = mapped_column(String(100))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    category: Mapped[str] = mapped_column(String(30))
    reference: Mapped[str] = mapped_column(String(100))


class Insight(Base):
    __tablename__ = "insights"
    __table_args__ = (UniqueConstraint("customer_id", "type"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    type: Mapped[str] = mapped_column(String(30))
    score: Mapped[int]
    status: Mapped[str] = mapped_column(String(20), default="pending")
    evidence: Mapped[list] = mapped_column(JSON)
    personalization: Mapped[dict] = mapped_column(JSON)
