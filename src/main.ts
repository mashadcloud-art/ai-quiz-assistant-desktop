// src/main.ts
import { app, BrowserWindow } from 'electron';
import path from 'path';
import express from 'express';
import apiRouter from './server/api';
import { createServer } from 'http';
import crypto from 'crypto';

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, 'ui', 'index.html')).catch(console.error);
}

app.whenReady().then(() => {
  // Start local Express API on a random port bound to localhost
  const api = express();
  api.use(express.json());
  api.use('/api', apiRouter);

  const server = createServer(api);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address() as any;
    console.log(`API listening at http://127.0.0.1:${address.port}`);
    // Write secret token to a temp file for the extension to read (optional)
    const secret = crypto.randomBytes(16).toString('hex');
    // In production you would store this securely, e.g., in app data.
    console.log('Auth token:', secret);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
