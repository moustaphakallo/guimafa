const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3100;
const DATA_FILE = path.join(__dirname, 'data.json');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/guimafa';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const seedData = {
  accounts: [
    {
      id: 'acc-guimafa-001',
      name: 'Moustapha Amadou Kallo',
      accountNumber: '240120001',
      balance: 1258000,
      currency: 'NGN',
      phone: '07075792596',
      pin: '1234'
    },
    {
      id: 'acc-guimafa-002',
      name: 'Aisha Bello',
      accountNumber: '240120002',
      balance: 420500,
      currency: 'NGN',
      phone: '08021234567',
      pin: '1234'
    }
  ],
  transactions: [
    { id: 'TXN1001', from: '240120001', to: '240120002', amount: 25000, type: 'transfer', status: 'completed', note: 'School fees', createdAt: '2026-11-01T09:30:00.000Z' },
    { id: 'TXN1000', from: 'external', to: '240120001', amount: 150000, type: 'credit', status: 'completed', note: 'Salary', createdAt: '2026-10-30T16:10:00.000Z' }
  ]
};

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(seedData, null, 2));
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  let changed = false;
  data.accounts.forEach(account => {
    if (!account.pin) {
      account.pin = '1234';
      changed = true;
    }
  });
  if (changed) saveData(data);
  return data;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/accounts/:accountNumber', (req, res) => {
  const data = loadData();
  const account = data.accounts.find(item => item.accountNumber === req.params.accountNumber);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  res.json(account);
});

app.post('/api/lookup-account', (req, res) => {
  const search = String(req.body.accountNumber || req.body.phone || '').replace(/\D/g, '');
  const data = loadData();
  const account = data.accounts.find(item =>
    item.accountNumber === search || item.phone.replace(/\D/g, '') === search
  );
  if (!account) return res.status(404).json({ error: 'Recipient account not found' });
  res.json({ name: account.name, accountNumber: account.accountNumber, phone: account.phone });
});

app.post('/api/transfers', (req, res) => {
  const data = loadData();
  const fromNumber = String(req.body.fromAccount || '').replace(/\D/g, '');
  const recipientSearch = String(req.body.toAccount || req.body.phone || '').replace(/\D/g, '');
  const amount = money(req.body.amount);

  const sender = data.accounts.find(item => item.accountNumber === fromNumber);
  const recipient = data.accounts.find(item =>
    item.accountNumber === recipientSearch || item.phone.replace(/\D/g, '') === recipientSearch
  );
  if (!sender) return res.status(404).json({ error: 'Sender account not found' });
  if (!recipient) return res.status(404).json({ error: 'Recipient account not found' });
  if (String(req.body.pin || '') !== sender.pin) return res.status(401).json({ error: 'Incorrect secret code' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount' });
  if (sender.accountNumber === recipient.accountNumber) return res.status(400).json({ error: 'Choose a different recipient account' });
  if (amount > sender.balance) return res.status(400).json({ error: 'Insufficient balance' });

  sender.balance = money(sender.balance - amount);
  recipient.balance = money(recipient.balance + amount);
  const transaction = {
    id: `TXN${crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8)}`,
    from: sender.accountNumber,
    to: recipient.accountNumber,
    amount,
    type: 'transfer',
    status: 'completed',
    note: String(req.body.note || 'Bank transfer').trim(),
    createdAt: new Date().toISOString()
  };
  data.transactions.unshift(transaction);
  saveData(data);
  res.status(201).json({ transaction, senderBalance: sender.balance, recipientBalance: recipient.balance });
});

app.get('/api/accounts/:accountNumber/transactions', (req, res) => {
  const data = loadData();
  const account = data.accounts.find(item => item.accountNumber === req.params.accountNumber);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const transactions = data.transactions.filter(tx =>
    tx.from === account.accountNumber || tx.to === account.accountNumber
  );
  res.json(transfersForAccount(transactions, account.accountNumber));
});

function transfersForAccount(transfers, accountNumber) {
  return transfers.map(tx => ({
    ...tx,
    direction: tx.to === accountNumber ? 'credit' : 'debit'
  }));
}

const ApplicationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  reference: { type: String, required: true, unique: true }
}, { timestamps: true });
const Application = mongoose.models.Application || mongoose.model('Application', ApplicationSchema);

app.post('/api/v1/applications', async (req, res) => {
  const required = ['name'];
  if (required.some(field => !String(req.body[field] || '').trim())) {
    return res.status(400).json({ error: 'Please complete every required field' });
  }
  try {
    const reference = `GM${Date.now().toString().slice(-8)}`;
    const application = await Application.create({ name: req.body.name.trim(), reference });
    res.status(201).json({ ok: true, reference: application.reference, id: application._id });
  } catch (error) {
    console.error('Application save failed:', error);
    res.status(500).json({ error: 'Unable to save application' });
  }
});

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`MongoDB connected: ${mongoose.connection.name}`);
    app.listen(PORT, () => {
      console.log(`Guimafa Bank running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;
