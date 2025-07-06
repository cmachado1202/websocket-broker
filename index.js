const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Mapas para mantener conexiones activas
const tablets = new Map(); // tabletId => ws
const viewers = new Map(); // tabletId => Set<ws>

console.log("📡 Servidor Render v1.1 listo.");

wss.on('connection', (ws) => {
    let clientId = null;
    let clientType = null;

    console.log("🔗 Cliente conectado.");

    ws.on('message', (message) => {
        if (Buffer.isBuffer(message)) {
            // 🖼️ Frame recibido desde una tablet
            if (clientType === 'tablet' && clientId) {
                const viewerSet = viewers.get(clientId);
                if (viewerSet?.size > 0) {
                    viewerSet.forEach((viewerWs) => {
                        if (viewerWs.readyState === WebSocket.OPEN) {
                            try {
                                viewerWs.send(message, { binary: true });
                                console.log(`✅ Frame reenviado a ${viewerSet.size} visores`);
                            } catch (e) {
                                console.error("❌ Error al enviar frame a visor", e);
                            }
                        }
                    });
                } else {
                    console.warn("🚫 Frame descartado: sin visores conectados");
                }
            } else {
                console.warn("🚫 Frame recibido de cliente no autenticado o no tablet");
            }
            return;
        }

        // 📡 Mensaje JSON: identificación o comandos táctiles
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

            console.log(`🆔 [IDENTIFY] ${clientType} con ID: ${clientId}`);

            if (clientType === 'tablet') {
                // Si ya existe una tablet con este ID, cierra la anterior
                if (tablets.has(clientId)) {
                    console.log("⚠️ Cerrando conexión previa de tablet...");
                    tablets.get(clientId).close();
                }
                tablets.set(clientId, ws);

                // Notificar a todos los visores que esta tablet está conectada
                const viewerSet = viewers.get(clientId);
                if (viewerSet) {
                    viewerSet.forEach((v) => {
                        if (v.readyState === WebSocket.OPEN) {
                            v.send(JSON.stringify({ type: 'tablet_connected' }));
                        }
                    });
                }

            } else if (clientType === 'viewer') {
                if (!viewers.has(clientId)) {
                    viewers.set(clientId, new Set());
                }
                viewers.get(clientId).add(ws);

                // Si ya hay una tablet conectada, notificar al visor
                if (tablets.has(clientId)) {
                    ws.send(JSON.stringify({ type: 'tablet_connected' }));
                }
            }

        } else if (clientType === 'viewer') {
            // Reenviar comandos táctiles a la tablet
            const tabletWs = tablets.get(clientId);
            if (tabletWs && tabletWs.readyState === WebSocket.OPEN) {
                tabletWs.send(JSON.stringify(data));
            } else {
                console.warn("🚫 Comando ignorado: tablet desconectada");
            }
        }
    });

    ws.on('close', () => {
        console.log(`🔌 Cliente desconectado: ${clientType} - ${clientId}`);

        // Eliminar tablet
        if (clientType === 'tablet' && tablets.get(clientId) === ws) {
            tablets.delete(clientId);

            // Notificar a visores que la tablet se desconectó
            const viewerSet = viewers.get(clientId);
            if (viewerSet) {
                viewerSet.forEach((v) => {
                    if (v.readyState === WebSocket.OPEN) {
                        v.send(JSON.stringify({ type: 'tablet_disconnected' }));
                    }
                });
            }
        }

        // Eliminar visor
        if (clientType === 'viewer' && viewers.has(clientId)) {
            viewers.get(clientId).delete(ws);
            if (viewers.get(clientId).size === 0) {
                viewers.delete(clientId);
            }
        }
    });
});

// Ruta raíz
app.get('/', (req, res) => {
    res.send('✅ Servidor broker funcionando correctamente.');
});

// Iniciar servidor
const port = process.env.PORT || 19000;
server.listen(port, () => {
    console.log(`🚀 Servidor escuchando en el puerto ${port}`);
});
