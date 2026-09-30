"""The 40 signals and four cross-cutting metadata fields in the supplied catalog."""
SIGNALS = {
    "age_group": ("Tranche d’âge", "kyc"),
    "employment_status": ("Situation professionnelle", "declared"),
    "occupation": ("Profession", "declared"),
    "industry": ("Secteur d’activité", "declared"),
    "monthly_income": ("Revenu mensuel récurrent", "transaction"),
    "income_change_percentage": ("Évolution des revenus", "transaction"),
    "income_source_type": ("Sources de revenus", "transaction"),
    "new_recurring_salary": ("Nouveau salaire récurrent", "transaction"),
    "salary_stopped": ("Salaire habituel non observé", "transaction"),
    "student_grant_detected": ("Bourse d’études possible", "transaction"),
    "household_status": ("Situation familiale", "declared"),
    "dependents_count": ("Personnes à charge", "declared"),
    "current_account_balance": ("Solde des comptes courants", "account"),
    "savings_balance": ("Solde d’épargne", "account"),
    "monthly_savings_rate": ("Taux de transfert vers l’épargne", "transaction"),
    "savings_trend": ("Tendance de l’épargne", "account"),
    "recurring_expenses": ("Dépenses récurrentes", "transaction"),
    "new_rent_payment": ("Nouveau loyer récurrent", "transaction"),
    "housing_spending_increase": ("Évolution des dépenses de logement", "transaction"),
    "travel_spending_detected": ("Dépenses de voyage", "transaction"),
    "foreign_transaction_activity": ("Activité en devise ou pays étranger", "transaction"),
    "unusual_spending": ("Dépenses inhabituelles", "transaction"),
    "spending_category_shift": ("Changement de répartition des dépenses", "transaction"),
    "monthly_expenses": ("Dépenses mensuelles", "transaction"),
    "expense_change_percentage": ("Évolution des dépenses", "transaction"),
    "overdraft_frequency": ("Fréquence des soldes négatifs", "account"),
    "low_balance_risk": ("Projection de solde avant le prochain revenu", "inferred"),
    "savings_withdrawal_detected": ("Retrait important d’épargne", "transaction"),
    "loan_products": ("Crédits détenus", "product_database"),
    "monthly_loan_commitment": ("Mensualités des crédits", "product_database"),
    "mortgage_started": ("Nouveau crédit hypothécaire", "product_database"),
    "owned_kbc_products": ("Produits détenus", "product_database"),
    "investment_balance": ("Valorisation des investissements", "product_database"),
    "investment_risk_profile": ("Profil d’investissement déclaré", "declared"),
    "financial_goal": ("Objectif déclaré", "declared"),
    "preferred_channel": ("Canal préféré", "declared"),
    "mobile_usage_frequency": ("Utilisation de l’application", "app_log"),
    "kate_interaction_history": ("Interactions structurées avec Kate", "kate_log"),
    "customer_confirmed_event": ("Réponses du client", "kate_confirmation"),
    "personalization_consent": ("Consentement à la personnalisation", "declared"),
}

METADATA = {"data_source": "source", "signal_confidence": "confidence",
            "signal_timestamp": "timestamp", "signal_status": "status"}


def empty_catalog(as_of, blocked=False):
    return {key: {"label": label, "value": None, "source": source, "confidence": None,
                  "confidence_kind": "not_available", "timestamp": str(as_of), "status": "unknown",
                  "availability": "blocked" if blocked else "unavailable", "evidence": [],
                  "limitations": ["Personnalisation non autorisée." if blocked else "Source ou historique insuffisant."]}
            for key, (label, source) in SIGNALS.items()}


def set_signal(catalog, key, value, *, source=None, confidence=1.0, status="observed", timestamp=None, evidence=None, limitations=None):
    item = catalog[key]
    item.update(value=value, source=source or item["source"], confidence=confidence, status=status,
                confidence_kind="heuristic_not_calibrated" if confidence < 1 else "input_assertion_or_exact_calculation",
                timestamp=str(timestamp or item["timestamp"]), availability="available",
                evidence=evidence or [], limitations=limitations or [])
    return item
