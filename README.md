# LifeFlow · Les Perdus

Première version du PoC pour le challenge KBC : comprendre des signaux bancaires fictifs, repérer un changement possible et adapter l’accompagnement après confirmation du client.

## Lancer la démonstration

Sur ce poste, un Python portable a été préparé dans `.tools/` (ignoré par Git). Le démarrage local sans Docker est disponible via :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

Ce script utilise `.venv/` si disponible, sinon le Python portable, avec SQLite par défaut. Sur un autre poste, suivre l’une des installations ci-dessous.

Avec **Docker Desktop démarré**, depuis la racine :

```powershell
docker compose up --build -d
```

- Tableau de bord et aperçu client : **http://localhost:8000**
- Documentation interactive de l’API : **http://localhost:8000/docs**
- État du service : **http://localhost:8000/health**

PostgreSQL est créé automatiquement, avec un volume persistant. Les trois profils sont insérés au premier démarrage. Le service est exposé uniquement sur la machine locale. Arrêt : `docker compose down` (conserve les données).

### Sans Docker : Python 3.11 ou ultérieur

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Sans variable `DATABASE_URL`, ce mode utilise **SQLite** (`lifeflow.db`) pour faciliter les essais. Docker utilise **PostgreSQL**. Pour une autre base, définir `DATABASE_URL` avant le lancement. Le backend se lance depuis la racine du dépôt.

## Application Flutter

Le tableau de bord inclut un aperçu HTML du téléphone. La véritable application Flutter est dans `frontend/` et appelle la même API. L’API doit être démarrée avant Flutter.

```powershell
cd frontend
flutter pub get
flutter run -d chrome --web-port 5173 --dart-define=API_BASE_URL=http://localhost:8000
```

Alternative si Chrome n’est pas installé : `flutter run -d web-server --web-port 5173`, puis ouvrir http://localhost:5173 dans un navigateur. Compilation : `flutter build web`.

La cible **web** est fournie dans cette V1. Pour ajouter Android/iOS sur un poste équipé des SDK : `flutter create --platforms=android,ios .`. Sur un émulateur Android, utiliser `--dart-define=API_BASE_URL=http://10.0.2.2:8000` et configurer HTTP pour le développement. Les cibles natives et la distribution mobile ne sont pas validées dans cette version.

## Parcours de démonstration

1. Sélectionner **Thomas** : historique juillet–août, aucune hypothèse active.
2. Cliquer **Simuler septembre** : premier salaire + trajet SNCB → premier emploi possible, score **80/100**.
3. Consulter les indices dans le tableau de bord. Confirmer côté client, puis ouvrir **Préparer mon budget**.
4. Passer à **Sophie** : loyer + mobilier + énergie → déménagement possible.
5. Passer à **Marc** : avion + hébergement → voyage possible. Refuser la suggestion pour montrer le contrôle client.
6. **Réinitialiser** restaure l’historique initial du client sélectionné et supprime ses événements et transactions ajoutées, y compris celles envoyées manuellement par l’API.

Flutter et le tableau de bord relisent l’état toutes les cinq secondes. Les simulations sont idempotentes ; les réponses du client sont enregistrées en base.

## Infrastructure

```text
Flutter (vue client) ───────┐
                          ├── REST JSON ── FastAPI ── PostgreSQL
Dashboard HTML/CSS/JS ─────┘                   │
                                  Signaux → événements → messages
                                                         │
                                                 Gemini optionnel
```

Le tableau de bord est servi par FastAPI, sans build Node supplémentaire. La logique métier reste entièrement en Python.

```text
backend/main.py             API, simulation, feedback, ingestion
backend/database.py         SQLAlchemy, PostgreSQL / SQLite
backend/models.py           clients, transactions, événements persistés
backend/seed.py             profils et scénarios fictifs
backend/services/engine.py  signaux, règles pondérées, soldes
backend/services/gemini.py  messages Gemini avec repli local
backend/tests/             tests fonctionnels API
dashboard/                 tableau de bord responsive + aperçu client
frontend/                  application Flutter web
compose.yaml               API + PostgreSQL
```

Les signaux sont recalculés à partir des transactions ; les événements, leurs preuves, leur message et le feedback sont persistés. La fenêtre de détection couvre les 30 jours précédant la transaction la plus récente du client, et non l’horloge réelle : la démo reste rejouable. Les revenus et dépenses couvrent uniquement le dernier mois observé, potentiellement incomplet. Les montants sont stockés en décimal.

Un score est une **somme de poids de règles**, pas une probabilité calibrée. Un premier salaire observé n’établit pas un premier emploi réel ; la confirmation du client est nécessaire. Le moteur n’affirme pas une récurrence après un seul paiement.

## Gemini / Vertex AI (optionnel)

Sans configuration, les messages sont des modèles locaux : aucun appel cloud, aucune clé nécessaire. Pour Gemini Developer API, copier `.env.example` vers `.env`, renseigner `GEMINI_API_KEY` et `GEMINI_ENABLED=true`, puis relancer `docker compose up -d`. Le modèle est configurable via `GEMINI_MODEL`.

Pour **Vertex AI en exécution Python locale**, configurer les identifiants Application Default Credentials, puis :

```powershell
$env:GEMINI_ENABLED="true"
$env:GOOGLE_CLOUD_PROJECT="votre-projet"
$env:GOOGLE_CLOUD_LOCATION="global"
$env:GEMINI_MODEL="gemini-2.5-flash"
```

Le backend utilise le [SDK Google Gen AI](https://googleapis.github.io/python-genai/) et envoie seulement le type d’événement et les libellés des signaux. Le nom, les montants et les transactions brutes ne sont pas envoyés. Gemini rédige le titre et le message, pas les scores ni les actions. En cas d’échec, le message local prend le relais. L’intégration cloud nécessite un projet/modèle autorisé et n’est pas indispensable à la démo. Le fichier Compose ne monte pas d’identifiants Vertex ; un déploiement GCP devra fournir une identité de service.

## API

| Méthode | Chemin | Usage |
|---|---|---|
| GET | `/api/customers` | Profils fictifs |
| GET | `/api/customers/{id}` | État complet client |
| GET | `/api/customers/{id}/transactions` | Opérations |
| GET | `/api/customers/{id}/insights` | Signaux et événements |
| POST | `/api/customers/{id}/simulate` | Jouer septembre une fois |
| POST | `/api/customers/{id}/reset` | Restaurer le client fictif |
| POST | `/api/customers/{id}/insights/{event_id}/feedback` | `{"status":"confirmed"}` ou `dismissed` |
| POST | `/api/transactions` | Ajouter une transaction et recalculer |

Exemple d’ingestion :

```json
{
  "customer_id": 1,
  "date": "2026-09-01",
  "merchant": "Employeur fictif",
  "amount": "2650.00",
  "category": "salary",
  "reference": "user-salary-001"
}
```

La référence doit commencer par `user-` et être unique par client ; un doublon retourne 409. Les catégories acceptées figurent dans `/docs`.

## Vérification

```powershell
docker compose exec api pytest backend/tests -q
# Ou en Python local :
.\.venv\Scripts\python.exe -m pytest backend/tests -q

cd frontend
flutter analyze
flutter build web
```

Les tests vérifient les trois scénarios, la persistance du feedback, l’absence de doublons, la réinitialisation, l’expiration des événements, la validation des montants et la cohérence client/événement.

Validation réalisée sur ce poste : **9 tests API réussis sur SQLite**, analyse Flutter sans erreur, compilation Flutter web réussie. Les trois scénarios, la confirmation, le refus, la persistance après actualisation et la réinitialisation ont été exercés dans Edge ; l’affichage du tableau de bord a été vérifié à 390 px et à 1440 px. Flutter compilé a été ouvert dans Edge et connecté à l’API. La configuration Compose est valide, mais l’exécution PostgreSQL n’a pas pu être vérifiée : le moteur Docker local renvoie une erreur de démarrage. Gemini n’a pas été appelé sans identifiants cloud.

## Périmètre de cette V1

- Démonstration locale sur données synthétiques, sans connexion KBC ni mouvement d’argent réel.
- Pas d’authentification bancaire : les profils sont volontairement accessibles au présentateur. Un jeton partagé facultatif `DEMO_API_TOKEN` protège l’API de démo. Le tableau de bord le demande à la connexion ; Flutter l’accepte via `--dart-define=DEMO_API_TOKEN=...`. Ce jeton embarqué ne remplace pas une authentification utilisateur.
- Avant tout usage réel : authentification et autorisations par client, migrations de base, consentement, audit, gestion des secrets et traitement asynchrone. Aucun passage à l’échelle de millions de clients n’a été mesuré.
- Les actions ouvrent des conseils de préparation généraux ; elles ne souscrivent pas de produit et ne créent pas de virement.
- Aikido et le déploiement Google Cloud restent à réaliser avec les comptes de l’équipe. Ne jamais committer de clés ni de données bancaires réelles.

Prototype indépendant, sans affiliation officielle à KBC.
