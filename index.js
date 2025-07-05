const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const tablets = new Map(); // K: tabletId, V: WebSocket
const viewers = new Map(); // K: tabletId, V: Set de WebSockets

console.log("Servidor WebSocket v2.0 inicializándose...");

wss.on('connection', (ws, req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[CONEXIÓN] Nuevo cliente desde ${clientIp}`);
    
    let clientId = null;
    let clientType = null; // 'tablet' o 'viewer'

    ws.on('message', (message) => {
        // Los frames de video son binarios, los comandos son JSON (string)
        if (Buffer.isBuffer(message)) {
            if (clientType === 'tablet' && viewers.has(clientId)) {
                // Reenviar frame de video a todos los visores de esta tablet
                viewers.get(clientId).forEach(viewerWs => {
                    if (viewerWs.readyState === ws.OPEN) {
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
            console.error('[ERROR] Mensaje no JSON recibido:', message.toString());
            return;
        }

        // --- LÓGICA DE MANEJO DE MENSAJES ---

        if (data.type === 'identify') {
            clientId = data.tabletId;
            clientType = data.client;

            if (!clientId) {
                console.log('[CIERRE] Cliente no proporcionó tabletId. Cerrando conexión.');
                ws.close(1008, "tabletId es requerido.");
                return;
            }

            if (clientType === 'tablet') {
                console.log(`[IDENTIFY] TABLET registrada: ${clientId}`);
                // Si ya había una tablet con ese ID, la desconectamos
                if (tablets.has(clientId)) {
                    tablets.get(clientId).close(1000, "Nueva conexión de tablet iniciada");
                }
                tablets.set(clientId, ws);
                // --> ¡¡¡LA RESPUESTA CRÍTICA QUE FALTABA!!!
                console.log(`[RESPUESTA] Enviando 'identified_ok' a la tablet ${clientId}`);
                ws.send(JSON.stringify({ type: 'identified_ok' }));

            } else if (clientType === 'viewer') {
                console.log(`[IDENTIFY] VISOR conectado para tablet: ${clientId}`);
                if (!viewers.has(clientId)) {
                    viewers.set(clientId, new Set());
                }
                viewers.get(clientId).add(ws);
                console.log(`[INFO] Ahora hay ${viewers.get(clientId).size} visor(es) para ${clientId}`);

            } else {
                console.log(`[CIERRE] Tipo de cliente no válido: ${clientType}. Cerrando conexión.`);
                ws.close(1008, "Tipo de cliente no válido.");
            }
        
        // Comandos de Touch/Swipe enviados DESDE el visor HACIA la tablet
        } else if (clientType === 'viewer' && (data.type === 'tap_relative' || data.type === 'swipe_relative')) {
            if (tablets.has(clientId)) {
                const tabletWs = tablets.get(clientId);
                if (tabletWs && tabletWs.readyState === ws.OPEN) {
                    console.log(`[COMANDO] Reenviando '${data.type}' del visor a la tablet ${clientId}`);
                    tabletWs.send(JSON.stringify(data));
                }
            }
        }
    });

    ws.on('close', () => {
        console.log(`[DESCONEXIÓN] Cliente ${clientType} [${clientId}] se ha desconectado.`);
        if (clientType === 'tablet' && tablets.get(clientId) === ws) {
            tablets.delete(clientId);
            console.log(`[INFO] Tablet ${clientId} eliminada.`);
            // Notificar a los visores que la tablet se desconectó
            if (viewers.has(clientId)) {
                console.log(`[NOTIFICACIÓN] Avisando a visores de ${clientId} que la tablet se desconectó.`);
                viewers.get(clientId).forEach(viewerWs => {
                    if (viewerWs.readyState === ws.OPEN) {
                        viewerWs.send(JSON.stringify({type: 'tablet_disconnected'}));
                    }
                });
                viewers.delete(clientId);
            }
        } else if (clientType === 'viewer' && viewers.has(clientId)) {
            viewers.get(clientId).delete(ws);
            console.log(`[INFO] Un visor de ${clientId} se fue. Quedan ${viewers.get(clientId).size}.`);
            if (viewers.get(clientId).size === 0) {
                viewers.delete(clientId);
                console.log(`[INFO] Último visor de ${clientId} se fue. Eliminando el set.`);
            }
        }
    });

    ws.on('error', (error) => {
        console.error(`[ERROR] Error en WebSocket para ${clientType} [${clientId}]:`, error);
    });
});

// Endpoint de salud para Render
app.get('/', (req, res) => {
  res.status(200).send('Servidor Broker v2.0 para Control Remoto está funcionando.');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`✅ Servidor escuchando en el puerto ${PORT}`);
});
