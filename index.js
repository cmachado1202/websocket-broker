const express = require('express');
const http = require('http');
const { WebSocket, WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const tablets = new Map();
const viewers = new Map();

console.log("Servidor Broker v3.0 (con Keep-Alive) listo.");

wss.on('connection', (ws) => {
    let clientId = null;
    let clientType = null;
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    console.log("Cliente conectado.");

    ws.on('message', (message) => {
        if (Buffer.isBuffer(message)) {
            if (clientType === 'tablet' && clientId) {
                const viewerSet = viewers.get(clientId);
                viewerSet?.forEach((viewerWs) => {
                    if (viewerWs.readyState === WebSocket.OPEN) {
                        viewerWs.send(message, { binary: true });
                    }
                });
            }
            return;
        }

        let data;
        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            return;
        }

        if (data.type === 'identify') {
            clientId = data.tabletId;
            clientType = data.client;

            if (clientType === 'tablet') {
                if (tablets.has(clientId)) {
                    tablets.get(clientId).terminate();
                }
                tablets.set(clientId, ws);
                
                ws.send(JSON.stringify({ type: 'auth_success' }));
                const viewerSet = viewers.get(clientId);
                viewerSet?.forEach((v) => v.send(JSON.stringify({ type: 'tablet_connected' })));

            } else if (clientType === 'viewer') {
                if (!viewers.has(clientId)) {
                    viewers.set(clientId, new Set());
                }
                viewers.get(clientId).add(ws);

                ws.send(JSON.stringify({ type: 'auth_success' }));

                if (tablets.has(clientId)) {
                    ws.send(JSON.stringify({ type: 'tablet_connected' }));
                } else {
                    ws.send(JSON.stringify({ type: 'tablet_disconnected' }));
                }
            }
        } else if (clientType === 'viewer') {
            const tabletWs = tablets.get(clientId);
            if (tabletWs && tabletWs.readyState === WebSocket.OPEN) {
                tabletWs.send(JSON.stringify(data));
            }
        }
    });

    ws.on('close', () => {
        console.log(`Cliente desconectado: ${clientType} - ${clientId}`);
        if (clientType === 'tablet' && tablets.get(clientId) === ws) {
            tablets.delete(clientId);
            const viewerSet = viewers.get(clientId);
            viewerSet?.forEach((v) => v.send(JSON.stringify({ type: 'tablet_disconnected' })));
        }
        if (clientType === 'viewer' && viewers.has(clientId)) {
            viewers.get(clientId).delete(ws);
            if (viewers.get(clientId).size === 0) {
                viewers.delete(clientId);
            }
        }
    });

    ws.on('error', (err) => {
        console.error("Error de WebSocket:", err);
    });
});

const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log("Cliente inactivo, terminando conexión.");
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(pingInterval);
});

app.get('/', (req, res) => {
    res.send('Servidor broker funcionando.');
});

const port = process.env.PORT || 10000;
server.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
});
