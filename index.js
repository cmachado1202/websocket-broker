const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const tablets = new Map();
const viewers = new Map();

console.log("Servidor WebSocket v3.0 (simple) inicializándose...");

wss.on('connection', (ws) => {
    console.log(`[CONEXIÓN] Nuevo cliente.`);
    
    let clientId = null;
    let clientType = null;

    ws.on('message', (message) => {
        // Frames de video
        if (Buffer.isBuffer(message)) {
            if (clientType === 'tablet' && viewers.has(clientId)) {
                viewers.get(clientId).forEach(v => v.send(message, { binary: true }));
            }
            return;
        }

        let data;
        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            return; // Ignorar mensajes no-JSON
        }

        if (data.type === 'identify') {
            clientId = data.tabletId;
            clientType = data.client;

            if (clientType === 'tablet') {
                console.log(`[IDENTIFY] TABLET registrada: ${clientId}`);
                tablets.set(clientId, ws);
            } else if (clientType === 'viewer') {
                console.log(`[IDENTIFY] VISOR conectado para tablet: ${clientId}`);
                if (!viewers.has(clientId)) {
                    viewers.set(clientId, new Set());
                }
                viewers.get(clientId).add(ws);
            }
        } else if (clientType === 'viewer' && tablets.has(clientId)) {
            // Reenviar comandos de touch del visor a la tablet
            console.log(`[COMANDO] Reenviando '${data.type}' a la tablet ${clientId}`);
            tablets.get(clientId).send(JSON.stringify(data));
        }
    });

    ws.on('close', () => {
        console.log(`[DESCONEXIÓN] Cliente ${clientType} [${clientId}] se ha desconectado.`);
        if (clientType === 'tablet') {
            tablets.delete(clientId);
            if (viewers.has(clientId)) {
                viewers.get(clientId).forEach(v => v.send(JSON.stringify({type: 'tablet_disconnected'})));
                viewers.delete(clientId);
            }
        } else if (clientType === 'viewer' && viewers.has(clientId)) {
            viewers.get(clientId).delete(ws);
            if (viewers.get(clientId).size === 0) {
                viewers.delete(clientId);
            }
        }
    });
});

app.get('/', (req, res) => res.status(200).send('Servidor Broker v3.0 funcionando.'));
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ Servidor escuchando en ${PORT}`));
