const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const tablets = new Map();
const viewers = new Map();

console.log("Servidor WebSocket v5.0 (Diagnóstico Visor) inicializándose...");

wss.on('connection', (ws) => {
    let clientId = null;
    let clientType = null;

    ws.on('message', (message) => {
        // Frames de video
        if (Buffer.isBuffer(message)) {
            if (clientType === 'tablet' && viewers.has(clientId)) {
                const viewerSet = viewers.get(clientId);
                
                // 1. Reenviamos el frame de la imagen como siempre
                viewerSet.forEach(v => v.send(message, { binary: true }));

                // 2. ADEMÁS, enviamos un mensaje de texto para confirmar la recepción
                const confirmationMsg = JSON.stringify({
                    type: 'frame_received',
                    size: message.length,
                    timestamp: Date.now()
                });
                viewerSet.forEach(v => v.send(confirmationMsg));
            }
            return;
        }

        let data;
        try { data = JSON.parse(message.toString()); } catch (e) { return; }

        if (data.type === 'identify') {
            clientId = data.tabletId;
            clientType = data.client;
            console.log(`[IDENTIFY] Cliente identificado. Tipo: ${clientType}, ID: ${clientId}`);

            if (clientType === 'tablet') {
                tablets.set(clientId, ws);
            } else if (clientType === 'viewer') {
                if (!viewers.has(clientId)) viewers.set(clientId, new Set());
                viewers.get(clientId).add(ws);
            }
        } else if (clientType === 'viewer' && tablets.has(clientId)) {
            tablets.get(clientId).send(JSON.stringify(data));
        }
    });

    ws.on('close', () => {
        // ... (lógica de desconexión sin cambios) ...
        console.log(`[DESCONEXIÓN] Cliente ${clientType} [${clientId}] se ha desconectado.`);
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

app.get('/', (req, res) => res.status(200).send('Servidor Broker v5.0 funcionando.'));
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ Servidor escuchando en ${PORT}`));
