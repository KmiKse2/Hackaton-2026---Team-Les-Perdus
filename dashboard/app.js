const $ = (id) => document.getElementById(id);
const money = (value, currency = 'EUR') => value == null ? 'Indisponible' : new Intl.NumberFormat('fr-BE', { style: 'currency', currency }).format(Number(value));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let selected = 1;
let customers = [];
let state;
let busy = false;
let token = sessionStorage.getItem('lifeflow-token') || '';
const symbols = { FIRST_JOB: '↗', MOVING: '⌂', TRAVEL: '✈' };

async function api(path, method = 'GET', body) {
  const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Demo-Token': token }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    if (response.status === 401) $('token-form').hidden = false;
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Impossible de joindre LifeFlow. Vérifiez le serveur puis réessayez.');
  }
  return response.json();
}

function buttons() {
  const canSimulate = state && ['accounts', 'balances', 'transactions'].every((p) => state.consent.effective_permissions.includes(p));
  $('simulate').disabled = busy || !canSimulate || state.customer.simulated;
  $('simulate').textContent = busy ? 'Traitement en cours…' : state?.customer.simulated ? '✓ Septembre simulé' : '▶ Simuler septembre';
  $('reset').disabled = busy || !canSimulate;
  $('consent-toggle').disabled = busy || !state;
  $('personalization-toggle').disabled = busy || !state;
  $('profile-save').disabled = busy || !state;
  document.querySelectorAll('.customer-tab, .confirmation button, .action-button').forEach((button) => { button.disabled = busy; });
}

async function perform(task) {
  if (busy) return;
  busy = true;
  $('error').hidden = true;
  document.body.classList.add('busy');
  buttons();
  try { await task(); } catch (error) { $('error').textContent = error.message; $('error').hidden = false; }
  finally { busy = false; document.body.classList.remove('busy'); buttons(); }
}

function render() {
  const { customer, financial, signals, events, transactions } = state;
  $('customers').innerHTML = customers.map((c) => `<button class="customer-tab" data-customer="${c.id}" aria-pressed="${c.id === customer.id}"><span class="tab-initials">${escapeHtml(c.initials)}</span>${escapeHtml(c.name)}</button>`).join('');
  $('phone-avatar').textContent = customer.initials;
  $('greeting').textContent = `Bonjour ${customer.name} ☀`;
  $('balance').textContent = money(financial.balance, financial.currency);
  $('balance-note').textContent = `Snapshot bancaire · ${financial.currency} · ${state.analysis_date}`;
  $('credit-note').hidden = !financial.credit_limit_included && !financial.credit_limit_unknown;
  $('credit-note').textContent = financial.credit_limit_included ? 'Le disponible inclut une limite de crédit : ce montant ne représente pas uniquement vos fonds propres.' : 'L’inclusion éventuelle d’une limite de crédit n’est pas renseignée.';
  $('income').textContent = money(financial.income, financial.currency);
  $('expenses').textContent = money(financial.expenses, financial.currency);
  $('month').textContent = financial.period;
  $('period').textContent = financial.period;
  $('signal-count').textContent = signals.length;
  $('engine-status').textContent = `Analyse au ${state.analysis_date}`;
  $('signals').innerHTML = signals.length ? signals.map((s) => `<details class="signal-detail"><summary><span class="signal-check">${s.strength === 'strong' ? '✓' : '~'}</span><span>${escapeHtml(s.label)}</span><small>${s.strength === 'strong' ? 'STRUCTURÉ' : 'INDICE TEXTUEL'}</small></summary><div class="signal-proof"><p>Compte : ${escapeHtml(s.account_id)}</p><p>Champs : ${s.source_fields.map(escapeHtml).join(', ')}</p><p>Opérations : ${s.transaction_ids.length ? s.transaction_ids.map(escapeHtml).join(', ') : 'Contexte du compte ou du solde'}</p><p>${Object.entries(s.metrics).map(([key, value]) => `${escapeHtml(key)} : ${escapeHtml(value)}`).join(' · ')}</p>${s.limitations.map((l) => `<p>Limite : ${escapeHtml(l)}</p>`).join('')}</div></details>`).join('') : `<div class="empty-state"><strong>${state.kate_context.status === 'blocked' ? 'Analyse suspendue.' : 'Aucun signal exploitable.'}</strong>Les permissions et la qualité des données déterminent ce qui peut être observé.</div>`;
  renderBanking();
  renderProfile();
  const statuses = { pending: 'À confirmer par le client', confirmed: 'Confirmé par le client', dismissed: 'Refusé par le client' };
  $('events').innerHTML = events.length ? events.map((e) => `<div class="event"><div class="event-title"><span>${symbols[e.type] || '◇'} ${escapeHtml(e.personalization.label)}</span><b>${e.score}/100</b></div><div class="progress"><span style="width:${e.score}%"></span></div><div class="event-meta"><span>${statuses[e.status]}</span><span>${e.evidence.length} indices</span></div><details><summary>Pourquoi cette hypothèse ?</summary><ul>${e.evidence.map((v) => `<li>${escapeHtml(v.label)} · +${v.weight} points</li>`).join('')}</ul></details></div>`).join('') : '<div class="empty-state"><strong>Aucun changement détecté.</strong>L’expérience reste discrète tant que les indices sont insuffisants.</div>';
  const active = events.filter((e) => e.status !== 'dismissed');
  $('personalization').innerHTML = active.length ? active.map((e) => `<div class="insight-card ${e.status}"><div class="insight-symbol">${symbols[e.type] || '◇'}</div>${e.status === 'confirmed' ? '<div class="confirmed-tag">✓ VOUS AVEZ CONFIRMÉ</div>' : ''}<h3>${escapeHtml(e.personalization.title)}</h3><p>${escapeHtml(e.status === 'confirmed' ? 'Merci pour votre réponse. Voici une piste pour vous accompagner dans cette nouvelle étape.' : e.personalization.message)}</p>${e.status === 'pending' ? `<div class="confirmation"><button class="primary" data-feedback="confirmed" data-id="${e.id}">Oui, c’est le cas</button><button class="secondary" data-feedback="dismissed" data-id="${e.id}">Non</button></div>` : `<button class="action-button" data-plan="${e.id}">${escapeHtml(e.personalization.action)} →</button>`}</div>`).join('') : `<div class="welcome-card"><div class="insight-symbol">✳</div><h3>${events.length ? 'Merci pour votre retour.' : 'À vos côtés, au bon moment.'}</h3><p>${events.length ? 'Cette suggestion a été retirée. Vous gardez le contrôle de votre expérience.' : 'Quand votre quotidien évolue, votre accompagnement peut évoluer aussi.'}</p></div>`;
  $('transactions').innerHTML = transactions.slice(0, 4).map((t) => `<div class="tx"><div class="tx-icon">${Number(t.amount) > 0 ? '↙' : '↗'}</div><div class="tx-description"><strong>${escapeHtml(t.merchant)}</strong><small>${escapeHtml(t.date)}${t.internal_transfer ? ' · Entre vos comptes' : ' · Comptabilisée'}</small></div><span class="tx-amount ${Number(t.amount) > 0 ? 'positive' : ''}">${Number(t.amount) > 0 ? '+' : ''}${money(t.amount, t.currency)}</span></div>`).join('');
  buttons();
}

function renderBanking() {
  const { consent, accounts, data_quality: quality, kate_context: kate } = state;
  const valid = consent.status === 'valid';
  $('consent-status').textContent = valid ? 'VALIDE' : consent.status.toUpperCase();
  $('consent-summary').textContent = `${consent.effective_permissions.join(' · ') || 'Aucune permission active'} · Valide jusqu’au ${consent.valid_until || '—'} · ${consent.automatic_syncs_remaining} sync(s) automatique(s) restante(s) aujourd’hui`;
  $('consent-toggle').textContent = valid ? 'Révoquer le consentement démo' : 'Rétablir le consentement démo';
  const types = { interimAvailable: 'Disponible', interimBooked: 'Comptabilisé', closingBooked: 'Clôture comptable', expected: 'Attendu' };
  $('accounts').innerHTML = accounts.map((a) => `<details class="account-item"><summary>${escapeHtml(a.name || a.resourceId)} <small>${escapeHtml(a.cashAccountType || '?')} · ${escapeHtml(a.currency)} · ${escapeHtml(a.usage || '?')} · ${escapeHtml(a.status)}</small></summary>${a.balances.map((b) => `<p>${types[b.balanceType]} : <strong>${money(b.balanceAmount.amount, b.balanceAmount.currency)}</strong> · ${escapeHtml(b.referenceDate)}${b.creditLimitIncluded ? ' · crédit inclus' : ''}</p>`).join('') || '<p>Solde non accessible ou non fourni.</p>'}</details>`).join('');
  $('quality').innerHTML = `<p>${quality.pending_transactions} en attente exclue(s) · ${quality.internal_transfers} virement(s) interne(s) · ${quality.excluded_accounts} compte(s) hors analyse personnelle · ${quality.stale_balances} solde(s) périmé(s)</p>${quality.warnings.map((w) => `<p>${escapeHtml(w)}</p>`).join('')}<p>Les revenus excluent les virements entre comptes propres. Les devises ne sont pas additionnées.</p>`;
  $('kate-summary').textContent = kate.status === 'blocked' ? 'Contexte bloqué : accès aux données insuffisant.' : `${kate.observations.length} observation(s) · ${kate.hypotheses.length} hypothèse(s) · ${kate.rejected_hypotheses.length} refus mémorisé(s)`;
  $('kate-context').textContent = JSON.stringify(kate, null, 2);
}

const profileLabels = { student: 'Étudiant', employed: 'Salarié', self_employed: 'Indépendant', unemployed: 'Sans emploi', retired: 'Retraité', single: 'Célibataire', married: 'Marié', cohabiting: 'Cohabitant', divorced: 'Divorcé', under_18: 'Moins de 18 ans', '66+': '66 ans et plus', unknown: 'Inconnu' };
const statusLabels = { inferred: 'Hypothèse', confirmed: 'Confirmé / déclaré', rejected: 'Refusé', expired: 'Expiré', observed: 'Observé', unknown: 'Inconnu' };
function renderProfile() {
  const profile = state.customer_profile;
  const signals = profile.signals;
  $('profile-status').textContent = profile.blocked ? 'SUSPENDU' : profile.synthetic ? 'PROFIL FICTIF' : 'PROFIL FOURNI';
  $('profile-categories').innerHTML = profile.categories.length ? profile.categories.map((c) => `<div class="profile-category ${c.status}"><strong>${escapeHtml(c.value === true ? c.label : `${c.label} : ${profileLabels[c.value] || c.value}`)}</strong><small>${statusLabels[c.status]} · ${escapeHtml(c.source)} · ${escapeHtml(c.timestamp)}${c.confidence != null && c.status === 'inferred' ? ` · score ${Math.round(c.confidence * 100)}/100` : ''}</small>${c.source === 'inferred' ? `<div class="category-feedback"><button class="secondary" data-category="${escapeHtml(c.key)}" data-response="confirmed">Confirmer</button><button class="secondary" data-category="${escapeHtml(c.key)}" data-response="rejected">Refuser</button></div>` : ''}</div>`).join('') : '<p>Aucune catégorie exploitable. Vérifiez les sources et les consentements.</p>';
  $('profile-note').textContent = 'L’âge et la situation familiale proviennent du profil fourni. Les catégories déduites restent des hypothèses ; les scores ne sont pas des probabilités calibrées.';
  const enabled = signals.personalization_consent.value === true;
  $('personalization-toggle').textContent = enabled ? 'Désactiver la personnalisation' : 'Autoriser la personnalisation démo';
  const available = Object.values(signals).filter((s) => s.availability === 'available').length;
  $('catalog-summary').textContent = `Catalogue : ${available} / ${Object.keys(signals).length} signaux disponibles · 4 métadonnées par signal`;
  $('catalog-signals').innerHTML = Object.entries(signals).map(([key, s]) => `<details class="catalog-row"><summary><span>${escapeHtml(s.label)}</span><small>${escapeHtml(s.availability)} · ${statusLabels[s.status] || s.status}</small></summary><pre>${escapeHtml(JSON.stringify({ signal: key, ...s }, null, 2))}</pre></details>`).join('');
  if (!$('profile-form').contains(document.activeElement)) {
    $('profile-employment').value = signals.employment_status.value || 'unknown';
    $('profile-household').value = signals.household_status.value || 'unknown';
    $('profile-dependents').value = signals.dependents_count.value ?? '';
  }
}

async function load() {
  customers = await api('/customers');
  state = await api(`/customers/${selected}`);
  $('token-form').hidden = true;
  render();
}
$('customers').addEventListener('click', (event) => {
  const button = event.target.closest('[data-customer]');
  if (button) perform(async () => { const id = Number(button.dataset.customer); const next = await api(`/customers/${id}`); selected = id; state = next; $('profile-birth').value = ''; render(); });
});
$('simulate').addEventListener('click', () => perform(async () => { state = await api(`/customers/${selected}/simulate`, 'POST'); render(); }));
$('reset').addEventListener('click', () => perform(async () => { state = await api(`/customers/${selected}/reset`, 'POST'); render(); }));
$('consent-toggle').addEventListener('click', () => perform(async () => {
  const consent = await api(`/consents/${encodeURIComponent(state.consent.consent_id)}?customer_id=${selected}`);
  consent.consentStatus = state.consent.status === 'valid' ? 'revokedByPsu' : 'valid';
  if (consent.consentStatus === 'valid') consent.validUntil = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  state = await api(`/customers/${selected}/consent`, 'POST', consent);
  render();
}));
$('personalization-toggle').addEventListener('click', () => perform(async () => {
  state = await api(`/customers/${selected}/personalization-consent`, 'POST', {
    value: state.customer_profile.signals.personalization_consent.value !== true,
    source: 'declared', observed_at: new Date().toISOString().slice(0, 10),
    valid_until: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
  });
  render();
}));
$('profile-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const fact = (value) => ({ value, source: 'declared', observed_at: state.analysis_date });
  const attributes = { employment_status: fact($('profile-employment').value), household_status: fact($('profile-household').value) };
  if ($('profile-birth').value) attributes.date_of_birth = fact($('profile-birth').value);
  if ($('profile-dependents').value !== '') attributes.dependents_count = fact(Number($('profile-dependents').value));
  perform(async () => { state = await api(`/customers/${selected}/context`, 'POST', { attributes }); $('profile-birth').value = ''; render(); });
});
$('profile-categories').addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (button) perform(async () => { state = await api(`/customers/${selected}/categories/${encodeURIComponent(button.dataset.category)}/feedback`, 'POST', { status: button.dataset.response }); render(); });
});
$('personalization').addEventListener('click', (event) => {
  const feedback = event.target.closest('[data-feedback]');
  if (feedback) perform(async () => { state = await api(`/customers/${selected}/insights/${feedback.dataset.id}/feedback`, 'POST', { status: feedback.dataset.feedback }); render(); });
  const plan = event.target.closest('[data-plan]');
  if (plan) { const e = state.events.find((e) => e.id === Number(plan.dataset.plan)); $('plan-title').textContent = e.personalization.action; $('plan-copy').textContent = e.personalization.tip; $('plan-dialog').showModal(); }
});
$('close-dialog').addEventListener('click', () => $('plan-dialog').close());
$('token-form').addEventListener('submit', (event) => { event.preventDefault(); token = $('token').value; sessionStorage.setItem('lifeflow-token', token); perform(load); });
perform(load);
setInterval(() => { if (!busy && state && document.visibilityState === 'visible' && $('token-form').hidden) perform(async () => { const next = await api(`/customers/${selected}`); if (JSON.stringify(next) !== JSON.stringify(state)) { state = next; render(); } }); }, 5000);
