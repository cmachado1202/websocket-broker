const WebSocket = require('ws');

// Render proporciona el puerto, con 8080 como fallback.
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// --- CAMBIO CLAVE: Usamos Mapas en lugar de variables globales ---
// Esto nos permite manejar MÚLTIPLES tablets y visores al mismo tiempo.
const tablets = new Map(); // Almacena: clave=tabletId, valor=socket
const visores = new Map(); // Almacena: clave=socketDelVisor, valor=tabletIdQueQuiereVer

console.log(`[INFO] Servidor WebSocket iniciado en el puerto ${PORT}`);

wss.on('connection', (ws) => {
    console.log('[CONNECTION] Nuevo cliente conectado.');
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        let data = {};
        const messageAsString = message.toString();

        try {
            data = JSON.parse(messageAsString);
        } catch (e) {
            // Si no es JSON, es una IMAGEN de la tablet.
            const senderTabletId = ws.tabletId;
            if (senderTabletId) {
                // Buscamos a todos los visores que estén interesados en ESTA tablet.
                for (const [visorSocket, targetId] of visores.entries()) {
                    if (targetId === senderTabletId && visorSocket.readyState === WebSocket.OPEN) {
                        // Enviamos la imagen solo al visor correcto.
                        visorSocket.send(message, { binary: true });
                    }
                }
            }
            return; // Termina el procesamiento aquí para mensajes binarios.
        }

        // Si es JSON, procesamos el comando.
        if (data.type === 'identify') {
            // El cliente se está identificando.
            if (data.client === 'tablet' && data.tabletId) {
                // Una tablet se conecta y nos da su ID.
                tablets.set(data.tabletId, ws);
                ws.tabletId = data.tabletId; // Guardamos el ID en el socket para referencia futura.
                console.log(`>>> TABLET registrada: ${data.tabletId}`);
            } else if (data.client === 'visor' && data.targetTabletId) {
                // Un visor se conecta y nos dice a qué tablet quiere ver.
                visores.set(ws, data.targetTabletId);
                console.log(`>>> VISOR registrado para espiar a: ${data.targetTabletId}`);
            }
        } 
        else if (['tap_relative', 'swipe_relative', 'scroll'].includes(data.type) && data.targetTabletId) {
            // Un visor envía un comando de control para una tablet específica.
            const tabletSocket = tablets.get(data.targetTabletId); // Buscamos el socket de la tablet por su ID.
            if (tabletSocket && tabletSocket.readyState === WebSocket.OPEN) {
                // Si encontramos la tablet y está conectada, le reenviamos el comando.
                tabletSocket.send(messageAsString);
                console.log(`[COMMAND] Comando '${data.type}' reenviado a la tablet ${data.targetTabletId}`);
            } else {
                 console.log(`[WARN] Se recibió comando para la tablet ${data.targetTabletId}, pero no está conectada.`);
            }
        }
    });

    ws.on('close', () => {
        // Cuando un cliente se desconecta, lo eliminamos de nuestros registros.
        if (ws.tabletId) {
            // Era una tablet.
            console.log(`>>> TABLET desconectada: ${ws.tabletId}`);
            tablets.delete(ws.tabletId);
        } else if (visores.has(ws)) {
            // Era un visor.
            console.log(`>>> VISOR desconectado que espiaba a: ${visores.get(ws)}`);
            visores.delete(ws);
        } else {
            console.log('[CONNECTION] Un cliente no identificado se ha desconectado.');
        }
    });

    ws.on('error', (error) => console.error('[ERROR] Error en un socket:', error));
});

// Sistema Keep-Alive (idéntico al tuyo, funcionará igual)
const keepAliveInterval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            console.log('[KEEP_ALIVE] Cliente inactivo detectado. Terminando conexión.');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 30000);

wss.on('close', () => {
    console.log('[INFO] El servidor WebSocket se está cerrando.');
    clearInterval(keepAliveInterval);
});

console.log('[INFO] Lógica del servidor y listeners configurados.');
