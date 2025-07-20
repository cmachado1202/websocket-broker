const express = require('express');
const http = require('http');
const { WebSocket, WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const tablets = new Map();
const viewers = new Map();

console.log("Servidor Broker v4.0 (Protocolo Unificado) listo.");

wss.on('connection', (ws) => {
    let clientId = null;
    let clientRole = null; // Usaremos 'role' para ser consistentes
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    console.log("Cliente conectado. Esperando identificación...");

    ws.on('message', (message) => {
        // Primero, manejamos los datos binarios (imágenes)
        if (Buffer.isBuffer(message)) {
            if (clientRole === 'tablet' && clientId) {
                // Si el que envía es una tablet, reenviamos al visor correspondiente
                const viewerWs = viewers.get(clientId);
                if (viewerWs && viewerWs.readyState === WebSocket.OPEN) {
                    viewerWs.send(message, { binary: true });
                }
            }
            return;
        }

        // Si no es binario, es un mensaje de control (JSON)
        let data;
        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            console.log("Mensaje inválido (no es JSON válido):", message.toString());
            return;
        }

        // --- LÓGICA DE IDENTIFICACIÓN CORREGIDA ---
        if (data.type === 'identify') {
            // Buscamos las claves correctas: 'id' y 'role'
            clientId = data.id;
            clientRole = data.role;

            if (!clientId || !clientRole) {
                console.error("Mensaje de identificación inválido, falta 'id' o 'role'. Desconectando cliente.");
                ws.close(1011, "Identificación inválida.");
                return;
            }

            console.log(`Identificado: rol='${clientRole}', id='${clientId}'`);

            // Adjuntamos la info al objeto ws para fácil acceso
            ws.clientId = clientId;
            ws.clientRole = clientRole;

            if (clientRole === 'tablet') {
                if (tablets.has(clientId)) {
                    console.log(`Cerrando conexión antigua para la tablet ${clientId}`);
                    tablets.get(clientId).terminate();
                }
                tablets.set(clientId, ws);
                
                // Avisamos al visor que la tablet ya está aquí
                const viewerWs = viewers.get(clientId);
                if (viewerWs) {
                    viewerWs.send(JSON.stringify({ type: 'status', message: 'Tablet conectada. Esperando frames...' }));
                }

            } else if (clientRole === 'viewer') {
                if (viewers.has(clientId)) {
                     console.log(`Cerrando conexión antigua para el visor ${clientId}`);
                     viewers.get(clientId).terminate();
                }
                viewers.set(clientId, ws);

                ws.send(JSON.stringify({ type: 'status', message: 'Identificado. Esperando a la tablet...' }));

                // Si la tablet ya estaba conectada, avisamos al visor inmediatamente
                if (tablets.has(clientId)) {
                    ws.send(JSON.stringify({ type: 'status', message: 'Tablet conectada. Esperando frames...' }));
                }
            }
        // Si el mensaje es de un visor y no es de identificación, es un comando de control
        } else if (clientRole === 'viewer') {
            const tabletWs = tablets.get(clientId);
            if (tabletWs && tabletWs.readyState === WebSocket.OPEN) {
                // Reenviamos el comando (tap, swipe, etc.) a la tablet
                tabletWs.send(JSON.stringify(data));
            }
        }
    });

    ws.on('close', () => {
        console.log(`Cliente desconectado: rol='${clientRole}', id='${clientId}'`);
        if (clientRole === 'tablet' && tablets.get(clientId) === ws) {
            tablets.delete(clientId);
            // Avisamos al visor que la tablet se desconectó
            const viewerWs = viewers.get(clientId);
            if (viewerWs) {
                viewerWs.send(JSON.stringify({ type: 'status', message: 'La tablet se ha desconectado.' }));
            }
        } else if (clientRole === 'viewer' && viewers.get(clientId) === ws) {
            viewers.delete(clientId);
        }
    });

    ws.on('error', (err) => {
        console.error("Error de WebSocket:", err);
    });
});

// Sistema de Keep-Alive para evitar desconexiones por inactividad
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log("Cliente inactivo (no respondió al ping), terminando conexión.");
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(pingInterval);
});

// Ruta básica para confirmar que el servidor HTTP está vivo
app.get('/', (req, res) => {
    res.send('Servidor WebSocket para control remoto está funcionando.');
});

const port = process.env.PORT || 10000;
server.listen(port, () => {
    console.log(`Servidor HTTP y WebSocket escuchando en el puerto ${port}`);
});
