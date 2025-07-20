const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Estructura de datos final y robusta.
// Clave: tabletId (ej: "7999dee...")
// Valor: { tablet: WebSocket | null, viewer: WebSocket | null }
const sessions = new Map();

console.log("Servidor Broker v7.0 (Producción) listo.");

// Manejador explícito para el upgrade de HTTP a WebSocket.
// Esto es crucial para la compatibilidad con proxies como el de Render.
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', (ws) => {
    console.log('Cliente conectado. Esperando identificación...');
    let session = null;
    let clientRole = null;
    let clientId = null; // Guardamos el ID aquí también para los logs de cierre.

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message, isBinary) => {
        // Si llegan datos de imagen (binarios), solo pueden venir de una tablet.
        // Los reenviamos al visor de su sesión.
        if (isBinary) {
            if (clientRole === 'tablet' && session && session.viewer) {
                if (session.viewer.readyState === 1 /* OPEN */) {
                    session.viewer.send(message, { binary: true });
                }
            }
            return;
        }

        let data;
        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            // Ignorar mensajes que no son JSON válidos
            return;
        }

        // Lógica de Identificación y Emparejamiento (Handshake)
        if (data.type === 'identify' && data.id && data.role) {
            clientId = data.id;
            clientRole = data.role;
            console.log(`--> Cliente identificado: rol='${clientRole}', id='${clientId}'`);

            if (!sessions.has(clientId)) {
                sessions.set(clientId, { tablet: null, viewer: null });
            }
            session = sessions.get(clientId);

            if (clientRole === 'tablet') {
                if(session.tablet) session.tablet.terminate(); // Desconectar tablet antigua si la hubiera
                session.tablet = ws;
                if (session.viewer) {
                    session.viewer.send(JSON.stringify({ type: 'status', message: 'Tablet conectada. ¡Iniciando streaming!' }));
                }
            } else if (clientRole === 'viewer') {
                 if(session.viewer) session.viewer.terminate(); // Desconectar visor antiguo si lo hubiera
                session.viewer = ws;
                if (session.tablet) {
                    session.viewer.send(JSON.stringify({ type: 'status', message: 'Tablet conectada. ¡Iniciando streaming!' }));
                } else {
                    session.viewer.send(JSON.stringify({ type: 'status', message: 'Identificado. Esperando a la tablet...' }));
                }
            }
        } 
        // Si el mensaje viene de un visor (y no es 'identify'), es un comando de control.
        else if (clientRole === 'viewer' && session && session.tablet) {
            if (session.tablet.readyState === 1 /* OPEN */) {
                // Reenviamos el comando (tap/swipe) a la tablet de la sesión.
                session.tablet.send(JSON.stringify(data));
            }
        }
    });

    ws.on('close', () => {
        console.log(`Cliente desconectado: rol='${clientRole}', id='${clientId}'`);
        if (clientId && sessions.has(clientId)) {
            const currentSession = sessions.get(clientId);
            if (clientRole === 'tablet' && currentSession.viewer) {
                currentSession.viewer.send(JSON.stringify({ type: 'status', message: 'La tablet se ha desconectado.' }));
                currentSession.tablet = null;
            }
            if (clientRole === 'viewer') {
                currentSession.viewer = null;
            }
            // Si la sesión queda completamente vacía, la eliminamos del mapa.
            if (!currentSession.tablet && !currentSession.viewer) {
                sessions.delete(clientId);
                console.log(`Sesión para [${clientId}] eliminada.`);
            }
        }
    });

    ws.on('error', (error) => console.error(`Error de WebSocket para [${clientId}]:`, error));
});

// Sistema de Keep-Alive para evitar desconexiones por inactividad
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => { clearInterval(pingInterval); });

app.get('/', (req, res) => { res.send('Servidor WebSocket para control remoto está funcionando.'); });

const port = process.env.PORT || 10000;
server.listen(port, () => {
    console.log(`Servidor HTTP y WebSocket escuchando en el puerto ${port}`);
});
