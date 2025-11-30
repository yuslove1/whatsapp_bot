import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import express from 'express';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';

const app = express();
const port = process.env.PORT || 3001;
app.use(express.json());

let sock: any = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Brentfield Bot', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update: Partial<{ connection: string; lastDisconnect: { error: any }; qr: string }>) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('Scan this QR with your phone:');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
      if (shouldReconnect) connectToWhatsApp();
    } else if (connection === 'open') {
      console.log('✅ WhatsApp bot connected!');
    }
  });
}

connectToWhatsApp();

// POST endpoint to send message to group
app.post('/api/send', async (req, res) => {
  const { chatId, message } = req.body;  // chatId = group ID like 120363xxxxxxxxxx@g.us
  if (!sock || !chatId || !message) {
    return res.status(400).json({ error: 'Missing chatId or message' });
  }

  try {
    await sock.sendMessage(chatId, { text: message });
    res.json({ success: true });
  } catch (error) {
    console.error('Send failed:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.listen(port, () => {
  console.log(`🤖 Bot webhook listening on port ${port}`);
});