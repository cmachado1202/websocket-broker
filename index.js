const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const tablets = new Map(); // tabletId => ws
const viewers = new Map(); // tabletId => Set<ws>

console.log("Servidor Render v1.1 listo.");

wss.on('connection', ws => {
    let clientId = null;
    let clientType = null;

    console.log("📡 Cliente conectado.");

    ws.on('message', message => {
        if (Buffer.isBuffer(message)) {
            // Imagen binaria desde tablet hacia visores
            if (clientType === 'tablet' && viewers.has(clientId)) {
                viewers.get(clientId).forEach(v => {
                    if (v.readyState === ws.OPEN) {
                        v.send(message, { binary: true });
                    }
                });
            }
            return;
        }

        let data;
        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            console.warn("❌ Mensaje no válido recibido.");
            return;
        }

        if (data.type === 'identify') {
            clientId = data.tabletId;
            clientType = data.client;
            console.log(`🆔 [IDENTIFY] ${clientType} con ID ${clientId}`);

            if (clientType === 'tablet') {
                // Si ya hay una tablet con ese ID, cerrarla
                if (tablets.has(clientId)) tablets.get(clientId).close();
                tablets.set(clientId, ws);

                // Notificar a visores que esta tablet está conectada
                if (viewers.has(clientId)) {
                    viewers.get(clientId).forEach(v => {
                        if (v.readyState === ws.OPEN) {
                            v.send(JSON.stringify({ type: 'tablet_connected' }));
                        }
                    });
                }

            } else if (clientType === 'viewer') {
                if (!viewers.has(clientId)) viewers.set(clientId, new Set());
                viewers.get(clientId).add(ws);

                // Si ya está conectada la tablet, avisarle al visor
                if (tablets.has(clientId)) {
                    ws.send(JSON.stringify({ type: 'tablet_connected' }));
                }
            }
        } else if (clientType === 'viewer') {
            // Reenviar comando del visor a la tablet
            const tabletWs = tablets.get(clientId);
            if (tabletWs && tabletWs.readyState === ws.OPEN) {
                tabletWs.send(JSON.stringify(data));
            }
        }
    });

    ws.on('close', () => {
        console.log(`🔌 Cliente desconectado: ${clientType} - ${clientId}`);

        if (clientType === 'tablet' && tablets.get(clientId) === ws) {
            tablets.delete(clientId);
            // Notificar a visores que la tablet se desconectó
            if (viewers.has(clientId)) {
                viewers.get(clientId).forEach(v => {
                    if (v.readyState === ws.OPEN) {
                        v.send(JSON.stringify({ type: 'tablet_disconnected' }));
                    }
                });
            }
        }

        if (clientType === 'viewer' && viewers.has(clientId)) {
            viewers.get(clientId).delete(ws);
            if (viewers.get(clientId).size === 0) {
                viewers.delete(clientId);
            }
        }
    });
});

app.get('/', (req, res) => res.send('✅ Servidor broker funcionando correctamente.'));

const port = process.env.PORT || 10000;
server.listen(port, () => console.log(`🚀 Servidor escuchando en el puerto ${port}`));
