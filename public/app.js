const ACCOUNT = '240120001';

const sections = [...document.querySelectorAll('.content-card')];
const moneyFormat = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });

function showSection(id) {
  sections.forEach(section => section.classList.toggle('active', section.id === id));
  if (id === 'dashboard') loadAccount();
  if (id === 'transactions') loadTransactions();
}

document.querySelectorAll('[data-section]').forEach(button => {
  button.addEventListener('click', () => showSection(button.dataset.section));
});

document.querySelector('.back-button').addEventListener('click', () => {
  const visible = sections.find(section => section.classList.contains('active'));
  showSection(visible?.id === 'dashboard' ? 'application' : 'dashboard');
});

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function renderTransactions(items, target) {
  target.innerHTML = '';
  if (!items.length) {
    target.innerHTML = '<p class="form-hint">No transactions yet.</p>';
    return;
  }
  items.slice(0, target.id === 'recent-transactions' ? 4 : undefined).forEach(tx => {
    const credit = tx.direction === 'credit';
    const row = document.createElement('div');
    row.className = 'transaction';
    row.innerHTML = `
      <div class="transaction-icon">${credit ? '&#8599;' : '&#8598;'}</div>
      <div><strong>${escapeHtml(tx.note || 'Bank transfer')}</strong><small>${new Date(tx.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })} · ${escapeHtml(tx.id)}</small></div>
      <div class="transaction-amount ${credit ? 'credit' : ''}">${credit ? '+' : '-'}${moneyFormat.format(tx.amount)}</div>`;
    target.appendChild(row);
  });
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

async function loadAccount() {
  try {
    const account = await api(`/api/accounts/${ACCOUNT}`);
    document.querySelector('#balance').textContent = moneyFormat.format(account.balance);
    document.querySelector('#account-summary').textContent = `•••• ${account.accountNumber.slice(-4)}  ·  ${account.currency}`;
    document.querySelector('#customer-first-name').textContent = account.name.split(' ')[0];
    await loadTransactions();
  } catch (error) {
    document.querySelector('#balance').textContent = 'Unavailable';
  }
}

async function loadTransactions() {
  try {
    const transactions = await api(`/api/accounts/${ACCOUNT}/transactions`);
    renderTransactions(transactions, document.querySelector('#recent-transactions'));
    renderTransactions(transactions, document.querySelector('#all-transactions'));
  } catch (error) {
    document.querySelector('#recent-transactions').innerHTML = '<p class="form-hint">Could not load transactions.</p>';
  }
}

document.querySelector('#refresh-account').addEventListener('click', loadAccount);

document.querySelector('#application-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.querySelector('#application-message');
  message.className = 'form-message';
  try {
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const result = await api('/api/applications', { method: 'POST', body: JSON.stringify(body) });
    message.textContent = `Application submitted. Reference: ${result.reference}`;
    message.classList.add('success');
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
});

document.querySelector('#lookup-recipient').addEventListener('click', async () => {
  const accountNumber = document.querySelector('#recipient-account').value.replace(/\D/g, '');
  const recipient = document.querySelector('#recipient-name');
  recipient.className = 'recipient-name';
  try {
    const result = await api('/api/lookup-account', { method: 'POST', body: JSON.stringify({ accountNumber }) });
    recipient.textContent = result.name;
    recipient.classList.add('visible');
  } catch (error) {
    recipient.textContent = error.message;
    recipient.classList.add('visible');
  }
});

document.querySelector('#transfer-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.querySelector('#transfer-message');
  message.className = 'form-message';
  const body = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api('/api/transfers', {
      method: 'POST',
      body: JSON.stringify({ fromAccount: ACCOUNT, toAccount: body.toAccount, amount: body.amount, pin: body.pin, note: body.note })
    });
    message.textContent = 'Transfer completed successfully.';
    message.classList.add('success');
    event.currentTarget.reset();
    document.querySelector('#recipient-name').className = 'recipient-name';
    await loadAccount();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
});

loadAccount();
