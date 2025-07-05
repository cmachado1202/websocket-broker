const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
// Render usa 'http' y gestiona SSL externamente.
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Estructuras para almacenar las conexiones
const tablets = new Map(); // K: tabletId, V: WebSocket
const viewers = new Map(); // K: tabletId, V: Set de WebSockets

console.log("Servidor WebSocket inicializándose...");

wss.on('connection', (ws, req) => {
    // El 'x-forwarded-for' es útil para ver la IP real del cliente en Render
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`Cliente conectado desde ${clientIp}`);
    
    let clientId = null;
    let clientType = null;

    ws.on('message', (message) => {
        try {
            // Los frames de video son binarios, los comandos son JSON (string)
            if (Buffer.isBuffer(message)) {
                if (clientType === 'tablet' && viewers.has(clientId)) {
                    viewers.get(clientId).forEach(viewerWs => {
                        if (viewerWs.readyState === viewerWs.OPEN) {
                            viewerWs.send(message, { binary: true });
                        }
                    });
                }
                return;
            }

            const data = JSON.parse(message);
            
            if (data.type === 'identify') {
                clientId = data.tabletId;
                clientType = data.client;

                if (!clientId) {
                    ws.close(1008, "tabletId es requerido.");
                    return;
                }

                if (clientType === 'tablet') {
                    console.log(`TABLET identificada: ${clientId}`);
                    // Si ya había una tablet con ese ID, la desconectamos
                    if (tablets.has(clientId)) {
                        tablets.get(clientId).close(1000, "Nueva conexión iniciada");
                    }
                    tablets.set(clientId, ws);
                    ws.send(JSON.stringify({ type: 'identified_ok' }));

                } else if (clientType === 'viewer') {
                    console.log(`VISOR conectado para tablet: ${clientId}`);
                    if (!viewers.has(clientId)) {
                        viewers.set(clientId, new Set());
                    }
                    viewers.get(clientId).add(ws);
                    ws.send(JSON.stringify({ type: 'viewer_ready' }));

                } else {
                     ws.close(1008, "Tipo de cliente no válido.");
                }
            } else { // Reenviar otros mensajes (como comandos de touch) desde el visor a la tablet
                 if (clientType === 'viewer' && tablets.has(clientId)) {
                    const tabletWs = tablets.get(clientId);
                    if (tabletWs && tabletWs.readyState === tabletWs.OPEN) {
                       tabletWs.send(message.toString());
                    }
                }
            }
        } catch (e) {
            console.error('Error procesando mensaje:', e);
        }
    });

    ws.on('close', () => {
        console.log(`Cliente ${clientType} [${clientId}] desconectado.`);
        if (clientType === 'tablet' && tablets.get(clientId) === ws) {
            tablets.delete(clientId);
            // Notificar a los visores que la tablet se desconectó
             if (viewers.has(clientId)) {
                viewers.get(clientId).forEach(viewerWs => {
                    if (viewerWs.readyState === viewerWs.OPEN) {
                        viewerWs.send(JSON.stringify({type: 'tablet_disconnected'}));
                    }
                });
                viewers.delete(clientId);
            }
        } else if (clientType === 'viewer' && viewers.has(clientId)) {
            viewers.get(clientId).delete(ws);
            if (viewers.get(clientId).size === 0) {
                viewers.delete(clientId);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('Error en WebSocket:', error);
    });
});

// Endpoint de salud para que Render sepa que el servicio está vivo
app.get('/', (req, res) => {
  res.status(200).send('Servidor Broker para Control Remoto está funcionando.');
});

// Render define la variable de entorno PORT.
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`✅ Servidor escuchando en el puerto ${PORT}`);
});
