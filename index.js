const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const tablets = new Map(), viewers = new Map();
console.log("Servidor Koyeb v2.0 listo.");
wss.on('connection', ws => {
    let clientId, clientType; console.log("Cliente conectado.");
    ws.on('message', message => {
        if (Buffer.isBuffer(message)) {
            if (clientType === 'tablet' && viewers.has(clientId)) {
                viewers.get(clientId).forEach(v => { if (v.readyState === ws.OPEN) v.send(message, { binary: true }); });
            } return;
        }
        let data; try { data = JSON.parse(message.toString()); } catch (e) { return; }
        if (data.type === 'identify') {
            clientId = data.tabletId; clientType = data.client;
            console.log(`[IDENTIFY] ${clientType} con ID ${clientId}`);
            if (clientType === 'tablet') {
                if (tablets.has(clientId)) tablets.get(clientId).close();
                tablets.set(clientId, ws);
            } else if (clientType === 'viewer') {
                if (!viewers.has(clientId)) viewers.set(clientId, new Set());
                viewers.get(clientId).add(ws);
            }
        } else if (clientType === 'viewer' && tablets.has(clientId)) {
            if (tablets.has(clientId) && tablets.get(clientId).readyState === ws.OPEN) {
                tablets.get(clientId).send(JSON.stringify(data));
            }
        }
    });
    ws.on('close', () => {
         console.log(`[DESCONEXIÓN] ${clientType} [${clientId}]`);
        if (clientType === 'tablet') {
            tablets.delete(clientId);
            if (viewers.has(clientId)) {
                viewers.get(clientId).forEach(v => v.send(JSON.stringify({type: 'tablet_disconnected'})));
                viewers.delete(clientId);
            }
        } else if (clientType === 'viewer' && viewers.has(clientId)) {
            viewers.get(clientId).delete(ws);
            if (viewers.get(clientId).size === 0) viewers.delete(clientId);
        }
    });
});
app.get('/', (req, res) => res.send('Servidor broker funcionando.'));
const port = process.env.PORT || 8080;
server.listen(port, () => console.log(`✅ Servidor escuchando en ${port}`));
