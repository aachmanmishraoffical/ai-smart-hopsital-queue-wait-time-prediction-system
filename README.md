# AI Smart Hospital Queue & Appointment System

This application provides source-attributed hospital directory listings and
platform-managed appointment requests, plus hospital-operated appointment and
queue features only when a participating hospital has supplied and verified
the required data. A directory listing is not proof
of current services, doctor availability, appointment availability, or queue
status. The application is not for emergencies, diagnosis, or medical advice.

## Data status and production limitations

- The project does not ship hospital, doctor, schedule, slot, or queue fixtures.
  The demo seed script was removed.
- Hospital discovery reads only source-attributed records from MongoDB. Imported
  national directory records are labelled as source-listed and are not treated
  as participating hospitals.
- Nearby discovery also queries OpenStreetMap's Overpass API for objects
  explicitly tagged as hospitals. Those point-of-interest records are
  source-listed only, are not saved to MongoDB, and do not prove current
  operation, services, staffing, or appointment availability. OpenStreetMap
  attribution and object links are shown in the UI.
- Manual location lookup uses the public Nominatim service only after a user
  submits a place search, restricts results to India, and asks the user to
  confirm the resolved location before searching. Requests are serialized,
  cached, timed out, and rate-limited; set `OSM_CONTACT_EMAIL` to a monitored
  contact address for production use. Results are cached in process memory;
  multi-instance deployments should use a shared cache/rate-limit gateway or
  disable Nominatim lookups to avoid exceeding the public service policy.
  `OVERPASS_URL` may select a permitted Overpass instance. Public provider
  availability is not guaranteed.
- The Government of India's
  [National Hospital Directory](https://www.data.gov.in/resource/national-hospital-directory-geo-code-and-additional-parameters-updated-till-last-month)
  is the intended directory source. The resource page must be accessible and
  its terms must permit the chosen download/synchronization method. Its live
  schema and current records have not been verified from this workspace.
- Doctor information and schedules must be verified against reliable
  hospital/provider sources. No doctor or schedule is bundled or assumed.
- The existing live-queue estimate requires at least 20 completed
  consultations in the preceding 30 days for a verified doctor, plus an
  explicit queue position. Otherwise the API returns `available: false` and an
  explanation. Its transparent baseline is:
  the recent mean consultation duration multiplied by the fresh queue count.
  Its range is derived from observed duration variance; this is not a trained
  or clinically validated AI model.
- Same-slot comparison estimates use only consented, reviewed reports from the
  prior year. A historical median is exposed only after 20 reviewed
  observations match the exact hospital and department. Otherwise the
  comparison reports why an estimate is unavailable. The optional ML service
  trains and chronologically evaluates a Random Forest against a historical
  median; it has no bundled artifact or production dataset and rejects a model
  with source observations older than one year. No estimate is claimed until
  sufficient legitimate reviewed data exists.
- Authenticated patients can submit actual arrival and service-start times
  with explicit consent. Reports contain no patient account identifier and
  remain `pending_review`; pending, unconsented, stale, or invalid observations
  are not exported for training or used by the comparison estimate. A
  designated data steward must review reports through the approved operational
  process; no admin login or self-approval route exists.
- Platform appointment requests can be saved for source-attributed MongoDB
  hospital records. Each request has a unique reference, patient ownership,
  idempotency key, history, and cancellation while still in the future and
  pending. Its status is always `pending_external_confirmation`: it is stored
  in this application only and is never sent to or accepted by the hospital.
  Creation is patient-authenticated and rate-limited to 10 requests per hour;
  unique reference and per-patient idempotency indexes are initialized before
  the backend begins listening.
  A department entered by a patient is a request, not evidence the hospital
  offers that service. Transient OpenStreetMap listings cannot be used to save
  requests because they are not persistent hospital records.
- `GET /api/comparisons/nearby` compares up to 25 nearby listings for a
  requested department and future time. It marks public directory department
  metadata separately from verified provider records and sorts by distance.
  Booking availability is false unless an authorized provider adapter reports
  it; estimates are exposed only when supported by reviewed data or a loaded
  model. Public listings are not included as hospital acceptance or
  availability evidence.
- `GET /api/integrations/status` reports booking, live queue, and model
  capability status. No provider adapter or authorized booking integration is
  currently configured. A future adapter must implement the contract in
  `backend/services/bookingProviderRegistry.js`; authorization evidence and
  secure credentials must be configured for the specific participating
  hospital. Do not mark a hospital authorized without its actual approval.
- No hospital booking/scheduling provider is configured. Do not represent an
  appointment as reserved externally; provider slot availability currently
  returns an explicit unavailable response.
- A platform-issued digital token is available only for verified participating
  hospitals with a currently verified, active, available provider record
  containing a department. `Hospital.participating` and the hospital's verified
  source status are required; the provider must belong to that hospital and
  have verified source status, `active: true`, and `status: "available"`.
  There is no separate department collection: the provider's `department`
  field is stored on the token. `Hospital.departments` is directory metadata,
  not an independent token-eligibility record. These flags are application
  eligibility checks, not an external hospital authorization handshake.
  Hospital participation and acceptance of platform-issued tokens must be
  confirmed with the hospital; the token is not an appointment, official queue
  position, or guarantee of acceptance. It is persisted in MongoDB and belongs
  to the authenticated patient. The platform does not currently support token
  cancellation or hospital-managed status transitions.
  The detail-page token may retain the patient's requested date and time; this
  records intent only and does not reserve an appointment or hospital slot.
- Patient token API: `POST /api/tokens` (authenticated patient request and
  `Idempotency-Key` header), `GET /api/tokens/my`, and
  `GET /api/tokens/:tokenCode`. Retrieval is scoped to the authenticated patient.
- A live read-only Atlas inventory on 2026-10-24 found no hospital, doctor, or
  token documents, and no hospital department entries. Consequently no
  hospital/provider pair currently satisfies token eligibility, so live token
  creation and retrieval cannot be exercised without a legitimately
  participating hospital and its verified provider data. Do not import public
  directory or OpenStreetMap listings as participating-provider authorization.
- A live nearby search on 2026-10-24 returned HTTP 200 with no directory
  records and OpenStreetMap marked unavailable after an upstream timeout. The
  Overpass integration caches successful nearby results in process memory for
  10 minutes, coalesces identical in-flight searches, avoids retrying timeouts
  or HTTP 429 responses, and retains one bounded retry for eligible transient
  failures. Provider errors are reported as unavailable rather than replaced
  with invented results. Public instances are shared, intended for small
  projects, and provide no availability guarantee; see the
  [Overpass API usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
  before deployment or increased traffic.

## Importing the official hospital directory

The data.gov.in resource page was not retrievable from this environment. No
records have been downloaded or imported, and no national coverage is claimed.
When permitted, download the official dataset from the resource page and
transform it to UTF-8 CSV with these headers:

```text
sourceRecordId,hospitalName,latitude,longitude,address,departments,officialWebsite,officialPhone
```

Use the source's stable record identifier. Separate multiple department values
with `|`. Website and phone are optional and must come from the source; do not
invent contact details. Keep the original downloaded file and note its actual retrieval time.
The importer validates coordinates, rejects repeated source IDs, skips
duplicate name/location pairs within a file, records the official source URL
and retrieval time, and upserts without deleting records. Imported entries are
marked `source_listed` and `participating: false`; they do not confirm current
hospital operation or service availability.

After configuring the correct Atlas `MONGODB_URI` locally, run:

```powershell
cd backend
npm ci
npm run sync:directory -- .\data\hospital-directory.csv --retrieved-at=2026-10-21T10:00:00Z
```

Replace the example timestamp with the file's actual retrieval time. Review
the field mapping against the current data.gov.in export before import. Never
run an import against an unverified database URI.

## Local development

Requirements: Node.js 18 or newer, npm, and a MongoDB database. Copy
`backend/.env.example` to `backend/.env`; configure one of `MONGODB_URI` or
legacy `MONGO_URI`, a unique `JWT_SECRET` of at least 32 characters,
`FRONTEND_URL`, and a monitored `OSM_CONTACT_EMAIL` for production. URL-encode reserved
characters in the MongoDB username/password (for example, `@` as `%40`).
Secrets in `.env` are gitignored.

```powershell
Set-Location 'C:\path\to\project\backend'
npm ci
npm run dev
```

Use `npm run dev` to run the backend with the project-local nodemon executable.
Do not run `nodemon` by itself: npm adds `backend\node_modules\.bin` to `PATH`
for project scripts, but PowerShell does not expose that local executable as a
global command. For a one-off non-watching start, use `npm start`.

In a second terminal, start the frontend:

```powershell
Set-Location 'C:\path\to\project\frontend'
npm ci
npm run dev
```

For a one-command Windows demo, run `python run_project.py` from the project
root after configuring `backend/.env`. It starts the backend and frontend and
also starts the local Python model service when an evaluated
`backend/ml/artifacts/wait_model.joblib` artifact exists. A configured external
`WAITING_MODEL_URL` is preserved. Without an evaluated artifact, the launcher
does not invent sample predictions; the backend can only use its reviewed-data
baseline when sufficient approved observations are available.

The hospital detail page also includes an offline showcase flow that does not
require a model artifact, hospital integration, or patient login. Its simulated
wait predictions and nearby hospital examples are repeatable for a selected
hospital, department, and future slot; its generated `DEMO-` token is local to
the browser and demonstrates a successful booking flow only. Every result is
marked as demo data and does not create a real appointment.

The local frontend defaults to `http://localhost:5000/api`. Public hospital
discovery does not require login. Patient accounts are required for personal
token and appointment-history endpoints.

## Deployment configuration

Configure backend secrets in the hosting provider's secret manager, not source
control:

```env
NODE_ENV=production
PORT=<provided-by-host>
MONGODB_URI=<restricted-mongodb-uri>
JWT_SECRET=<unique-random-secret-at-least-32-characters>
FRONTEND_URL=https://<frontend-domain>
TRUST_PROXY_HOPS=<trusted-proxy-hop-count>
# Optional private model-service URL; omit until an evaluated artifact exists.
WAITING_MODEL_URL=http://127.0.0.1:8100
```

Set frontend build-time variables:

```env
REACT_APP_API_URL=https://<api-domain>/api
REACT_APP_SOCKET_URL=https://<api-domain>
```

The backend must reach MongoDB before it listens. `GET /api/health` returns
HTTP 200 only while the Mongoose connection is established, otherwise HTTP
503. Authentication routes are rate-limited and request bodies are size
limited. CORS is restricted to `FRONTEND_URL`; production origins must use
HTTPS. Multi-instance production deployments need a shared rate-limit store
or upstream gateway limit.

## Tests

Run backend unit tests without modifying the configured database:

```powershell
cd backend
npm test
```

The authentication tests stub persistence to verify normalization, password
hashing, login verification, duplicate handling, and public response fields.
They do not prove that the configured MongoDB credentials can persist a real
account. Digital token issuance also requires a reachable MongoDB database and
verified participating hospital/provider records. The OpenStreetMap tests use
controlled provider responses; they do not guarantee that a public
Overpass/Nominatim endpoint is reachable at deployment.

## Reviewed waiting-time data and optional model

The prediction pipeline is opt-in. It exports only explicitly consented,
approved observations with a valid review timestamp; the CSV omits patient
identity. Review reports through the organization's approved data-steward
process before exporting. No patient reports, synthetic production data, or
trained artifact are bundled.

```powershell
Set-Location 'C:\path\to\project\backend'
python -m pip install -r .\ml\requirements.txt
npm run ml:test
npm run export:wait-observations -- .\data\approved-wait-observations.csv
npm run ml:train -- .\data\approved-wait-observations.csv --artifact .\ml\artifacts\wait_model.joblib --report .\data\wait-model-evaluation.json
npm run ml:service
```

The export command creates a new file and will not overwrite an existing one.
Training requires at least 50 valid, consented, reviewed observations overall,
chronologically separates the holdout, reports MAE/RMSE for the Random Forest
and historical-median baseline, and selects the Random Forest only if its MAE
is lower. Predictions additionally require at least 20 observations for that
hospital/department pair. Install and run the Python service only where the
model artifact and approved data can be handled securely. Configure the Node
backend's `WAITING_MODEL_URL` to its private URL; by default, the Python
service binds only to `127.0.0.1:8100`. The artifact and evaluation report are
generated outputs and must not be committed or presented as validated
production performance without real reviewed records. `npm run ml:service`
uses Flask's development server for local verification only. Deploy the service
behind a production WSGI server on a private network; if it runs in a separate
container, configure `WAITING_MODEL_HOST=0.0.0.0` only when network policy
prevents public access. Do not expose the unauthenticated model endpoint to the
public internet.

## Verification and publication

Available commands:

```powershell
cd backend
npm start
```

```powershell
cd frontend
npm run build
```

The project is not ready for public clinical operations until the production
Atlas access and permissions are verified, the official directory export and
its terms/schema are verified,
participating hospitals cooperate to supply current verified providers and
actual appointment availability, and healthcare privacy, security, clinical
safety, accessibility, and operational reviews are completed.
#   a i - s m a r t - h o p s i t a l - q u e u e - w a i t - t i m e - p r e d i c t i o n - s y s t e m  
 