const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(Number(value));
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
  $('simulate').disabled = busy || !state || state.customer.simulated;
  $('simulate').textContent = busy ? 'Traitement en cours…' : state?.customer.simulated ? '✓ Septembre simulé' : '▶ Simuler septembre';
  $('reset').disabled = busy || !state;
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
  $('balance').textContent = money(financial.balance);
  $('income').textContent = money(financial.income);
  $('expenses').textContent = money(financial.expenses);
  $('month').textContent = financial.period;
  $('period').textContent = financial.period;
  $('signal-count').textContent = signals.length;
  $('engine-status').textContent = customer.simulated ? 'Septembre · analyse terminée' : 'Historique initial · août';
  $('signals').innerHTML = signals.length ? signals.map((s) => `<div class="signal-row"><span class="signal-check">✓</span><span>${escapeHtml(s.label)}</span><small>${s.transaction_ids.length} opération(s)</small></div>`).join('') : '<div class="empty-state"><strong>Tout commence par un signal.</strong>Simulez septembre pour faire évoluer ce parcours.</div>';
  const statuses = { pending: 'À confirmer par le client', confirmed: 'Confirmé par le client', dismissed: 'Refusé par le client' };
  $('events').innerHTML = events.length ? events.map((e) => `<div class="event"><div class="event-title"><span>${symbols[e.type] || '◇'} ${escapeHtml(e.personalization.label)}</span><b>${e.score}/100</b></div><div class="progress"><span style="width:${e.score}%"></span></div><div class="event-meta"><span>${statuses[e.status]}</span><span>${e.evidence.length} indices</span></div><details><summary>Pourquoi cette hypothèse ?</summary><ul>${e.evidence.map((v) => `<li>${escapeHtml(v.label)} · +${v.weight} points</li>`).join('')}</ul></details></div>`).join('') : '<div class="empty-state"><strong>Aucun changement détecté.</strong>L’expérience reste discrète tant que les indices sont insuffisants.</div>';
  const active = events.filter((e) => e.status !== 'dismissed');
  $('personalization').innerHTML = active.length ? active.map((e) => `<div class="insight-card ${e.status}"><div class="insight-symbol">${symbols[e.type] || '◇'}</div>${e.status === 'confirmed' ? '<div class="confirmed-tag">✓ VOUS AVEZ CONFIRMÉ</div>' : ''}<h3>${escapeHtml(e.personalization.title)}</h3><p>${escapeHtml(e.status === 'confirmed' ? 'Merci pour votre réponse. Voici une piste pour vous accompagner dans cette nouvelle étape.' : e.personalization.message)}</p>${e.status === 'pending' ? `<div class="confirmation"><button class="primary" data-feedback="confirmed" data-id="${e.id}">Oui, c’est le cas</button><button class="secondary" data-feedback="dismissed" data-id="${e.id}">Non</button></div>` : `<button class="action-button" data-plan="${e.id}">${escapeHtml(e.personalization.action)} →</button>`}</div>`).join('') : `<div class="welcome-card"><div class="insight-symbol">✳</div><h3>${events.length ? 'Merci pour votre retour.' : 'À vos côtés, au bon moment.'}</h3><p>${events.length ? 'Cette suggestion a été retirée. Vous gardez le contrôle de votre expérience.' : 'Quand votre quotidien évolue, votre accompagnement peut évoluer aussi.'}</p></div>`;
  $('transactions').innerHTML = transactions.slice(0, 4).map((t) => `<div class="tx"><div class="tx-icon">${Number(t.amount) > 0 ? '↙' : '↗'}</div><div class="tx-description"><strong>${escapeHtml(t.merchant)}</strong><small>${escapeHtml(t.date)}</small></div><span class="tx-amount ${Number(t.amount) > 0 ? 'positive' : ''}">${Number(t.amount) > 0 ? '+' : ''}${money(t.amount)}</span></div>`).join('');
  buttons();
}

async function load() {
  customers = await api('/customers');
  state = await api(`/customers/${selected}`);
  $('token-form').hidden = true;
  render();
}
$('customers').addEventListener('click', (event) => {
  const button = event.target.closest('[data-customer]');
  if (button) perform(async () => { const id = Number(button.dataset.customer); const next = await api(`/customers/${id}`); selected = id; state = next; render(); });
});
$('simulate').addEventListener('click', () => perform(async () => { state = await api(`/customers/${selected}/simulate`, 'POST'); render(); }));
$('reset').addEventListener('click', () => perform(async () => { state = await api(`/customers/${selected}/reset`, 'POST'); render(); }));
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
